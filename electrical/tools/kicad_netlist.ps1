# ============================================================================
# kicad_netlist.ps1 - Full netlist extractor / sanity checker for .kicad_sch
#
# SPDX-License-Identifier: MIT
# Part of the noknok Ecosystem: https://github.com/buildwithnoknok/Ecosystem
#
# WHAT IT DOES
#   Reconstructs the netlist straight from a KiCad schematic file:
#     1. unions wire segments into nets (incl. endpoints landing mid-segment)
#     2. merges nets joined by labels, and nets sharing a global net name
#     3. snaps every symbol pin onto the resulting graph
#     4. names nets from power symbols, then from labels
#   Then prints every net with its member pins, plus two sanity checks:
#     - single-pin nets   -> almost always a MISSED CONNECTION
#     - pins on no wire   -> unused / no-connect pins (review the list)
#
# WHY
#   Answers "is this pin really connected to what I think it is?" without
#   clicking through the schematic. Good for reviewing a board before fab,
#   and for diffing a schematic after a rework.
#
# USAGE
#   .\kicad_netlist.ps1 -Path "MyBoard.kicad_sch"
#   .\kicad_netlist.ps1 -Path "MyBoard.kicad_sch" -OutFile "netlist.txt"
#
# LIMITS - read these before trusting a result
#   * NOT a replacement for KiCad's own ERC. It does not know pin electrical
#     types, power-input rules, or anything about the PCB.
#   * Sees only: wires, labels, power symbols, symbol pin geometry.
#     It does NOT handle buses, bus entries, or hierarchical sheets.
#   * Read-only. It never modifies the schematic.
#   If a result surprises you, verify it in KiCad before acting on it.
#
# TESTED ON
#   KiCad 10 .kicad_sch files (module-usb-led V2, 95 components).
# ============================================================================
param(
  [Parameter(Mandatory=$true)][string]$Path,
  [string]$OutFile
)
$ErrorActionPreference='Stop'
$text=[System.IO.File]::ReadAllText($Path)
$out=New-Object System.Collections.ArrayList
function W($s){ [void]$out.Add($s); Write-Output $s }

# ---------- library symbol pin definitions ----------
$libPins=@{}
$lb=[regex]::Matches($text,'(?m)^\t\t\(symbol "([^"]+)"')
for($i=0;$i -lt $lb.Count;$i++){
  $name=$lb[$i].Groups[1].Value; $start=$lb[$i].Index
  if($i+1 -lt $lb.Count){$end=$lb[$i+1].Index}else{$end=$text.Length}
  $blk=$text.Substring($start,$end-$start); $base=$name -replace '_\d+_\d+$',''
  if(-not $libPins.ContainsKey($base)){$libPins[$base]=New-Object System.Collections.ArrayList}
  # NOTE: keep this regex shape - group 5 is the span between (length) and
  # (number), which is where the (name "...") field lives. Pulling the name out
  # of group 5 avoids a second lazy wildcard that can run past the pin boundary
  # and scramble pin<->position pairing.
  foreach($p in [regex]::Matches($blk,'\(pin\s+\S+\s+\S+\s*\r?\n\s*\(at ([-\d.]+) ([-\d.]+) ([-\d.]+)\)\s*\r?\n\s*\(length ([-\d.]+)\)(.*?)\(number "([^"]+)"',[Text.RegularExpressions.RegexOptions]::Singleline)){
    $pname=''
    $nm=[regex]::Match($p.Groups[5].Value,'\(name "([^"]+)"')
    if($nm.Success){$pname=$nm.Groups[1].Value}
    $o=New-Object psobject
    $o|Add-Member NoteProperty PX ([double]$p.Groups[1].Value)
    $o|Add-Member NoteProperty PY ([double]$p.Groups[2].Value)
    $o|Add-Member NoteProperty PNAME $pname
    $o|Add-Member NoteProperty NUM ($p.Groups[6].Value)
    [void]$libPins[$base].Add($o)
  }
}

# ---------- placed component instances ----------
$placed=New-Object System.Collections.ArrayList
foreach($m in [regex]::Matches($text,'(?m)^\t\(symbol\s*\r?\n\t\t\(lib_id "([^"]+)"\)\s*\r?\n\t\t\(at ([-\d.]+) ([-\d.]+) ([-\d.]+)\)(.*?)(?=^\t\(symbol|\Z)',[Text.RegularExpressions.RegexOptions]::Singleline)){
  $b=$m.Groups[5].Value
  $ref='';$r=[regex]::Match($b,'\(property "Reference" "([^"]+)"');if($r.Success){$ref=$r.Groups[1].Value}
  $val='';$v=[regex]::Match($b,'\(property "Value" "([^"]*)"');if($v.Success){$val=$v.Groups[1].Value}
  $fp='';$f=[regex]::Match($b,'\(property "Footprint" "([^"]*)"');if($f.Success){$fp=$f.Groups[1].Value}
  $mir='';$mm=[regex]::Match($b,'\(mirror (\w+)\)');if($mm.Success){$mir=$mm.Groups[1].Value}
  $o=New-Object psobject
  $o|Add-Member NoteProperty REF $ref; $o|Add-Member NoteProperty VAL $val; $o|Add-Member NoteProperty FP $fp
  $o|Add-Member NoteProperty LIB $m.Groups[1].Value
  $o|Add-Member NoteProperty SX ([double]$m.Groups[2].Value); $o|Add-Member NoteProperty SY ([double]$m.Groups[3].Value)
  $o|Add-Member NoteProperty ROT ([double]$m.Groups[4].Value); $o|Add-Member NoteProperty MIR $mir
  [void]$placed.Add($o)
}

# ---------- wire graph (union-find) ----------
$wx1=@();$wy1=@();$wx2=@();$wy2=@()
foreach($m in [regex]::Matches($text,'\(wire\s*\r?\n\s*\(pts\s*\r?\n\s*\(xy ([-\d.]+) ([-\d.]+)\)\s*\r?\n?\s*\(xy ([-\d.]+) ([-\d.]+)\)')){
  $wx1+=[double]$m.Groups[1].Value;$wy1+=[double]$m.Groups[2].Value
  $wx2+=[double]$m.Groups[3].Value;$wy2+=[double]$m.Groups[4].Value
}
$parent=@{};$allPts=@{}
for($i=0;$i -lt $wx1.Count;$i++){
  $ka="{0:F2},{1:F2}" -f $wx1[$i],$wy1[$i]; $kb="{0:F2},{1:F2}" -f $wx2[$i],$wy2[$i]
  if(-not $parent.ContainsKey($ka)){$parent[$ka]=$ka}; if(-not $parent.ContainsKey($kb)){$parent[$kb]=$kb}
  $allPts[$ka]=@($wx1[$i],$wy1[$i]); $allPts[$kb]=@($wx2[$i],$wy2[$i])
  $ra=$ka;while($parent[$ra] -ne $ra){$ra=$parent[$ra]}
  $rb=$kb;while($parent[$rb] -ne $rb){$rb=$parent[$rb]}
  if($ra -ne $rb){$parent[$ra]=$rb}
}
# a wire endpoint landing mid-segment on another wire is a connection in KiCad
foreach($pk in @($allPts.Keys)){
  $px=$allPts[$pk][0];$py=$allPts[$pk][1]
  for($i=0;$i -lt $wx1.Count;$i++){
    $dx=$wx2[$i]-$wx1[$i];$dy=$wy2[$i]-$wy1[$i];$l2=$dx*$dx+$dy*$dy
    if($l2 -eq 0){continue}
    $t=(($px-$wx1[$i])*$dx+($py-$wy1[$i])*$dy)/$l2
    if($t -le 0.001 -or $t -ge 0.999){continue}
    if([math]::Abs($wx1[$i]+$t*$dx-$px) -lt 0.01 -and [math]::Abs($wy1[$i]+$t*$dy-$py) -lt 0.01){
      $kb="{0:F2},{1:F2}" -f $wx1[$i],$wy1[$i]
      $ra=$pk;while($parent[$ra] -ne $ra){$ra=$parent[$ra]}
      $rb=$kb;while($parent[$rb] -ne $rb){$rb=$parent[$rb]}
      if($ra -ne $rb){$parent[$ra]=$rb}
    }
  }
}
# ---------- merge nets sharing a label ----------
# A label attaches to the net at its (x,y). KiCad accepts a label sitting at a wire
# ENDPOINT *or mid-span on a wire* (or on a pin). We resolve the endpoint case directly;
# for the mid-span case we find the wire segment the label lies on and union onto it -
# without this, labels placed mid-wire are missed and their pins look disconnected.
$labelRoots=@{}
foreach($m in [regex]::Matches($text,'\((?:label|global_label|hierarchical_label) "([^"]+)"\s*\r?\n\s*\(at ([-\d.]+) ([-\d.]+)')){
  $nm=$m.Groups[1].Value
  $lx=[double]$m.Groups[2].Value; $ly=[double]$m.Groups[3].Value
  $k="{0:F2},{1:F2}" -f $lx,$ly
  if(-not $parent.ContainsKey($k)){
    # not a known node - is the label mid-span on a wire? if so, adopt that wire's endpoint
    $found=$false
    for($i=0;$i -lt $wx1.Count;$i++){
      $dx=$wx2[$i]-$wx1[$i];$dy=$wy2[$i]-$wy1[$i];$l2=$dx*$dx+$dy*$dy
      if($l2 -eq 0){continue}
      $tt=(($lx-$wx1[$i])*$dx+($ly-$wy1[$i])*$dy)/$l2
      if($tt -lt -0.01 -or $tt -gt 1.01){continue}
      if([math]::Abs($wx1[$i]+$tt*$dx-$lx) -lt 0.3 -and [math]::Abs($wy1[$i]+$tt*$dy-$ly) -lt 0.3){
        $k="{0:F2},{1:F2}" -f $wx1[$i],$wy1[$i]; $found=$true; break
      }
    }
    if(-not $found){continue}   # truly dangling label - leave unmerged (real issue worth seeing)
  }
  $r=$k;while($parent[$r] -ne $r){$r=$parent[$r]}
  if($labelRoots.ContainsKey($nm)){
    $ra=$labelRoots[$nm];while($parent[$ra] -ne $ra){$ra=$parent[$ra]}
    if($ra -ne $r){$parent[$ra]=$r}
  }
  $labelRoots[$nm]=$r
}
# ---------- map pins onto nets ----------
$pinNet=@{}; $pinInfo=@{}
foreach($sym in $placed){
  if(-not $libPins.ContainsKey($sym.LIB)){continue}
  $th=[math]::PI*$sym.ROT/180.0
  $c=[math]::Round([math]::Cos($th),6);$sn=[math]::Round([math]::Sin($th),6)
  foreach($pin in $libPins[$sym.LIB]){
    $rx=$pin.PX*$c-$pin.PY*$sn; $ry=-($pin.PX*$sn+$pin.PY*$c)
    if($sym.MIR -eq 'y'){$rx=-$rx}; if($sym.MIR -eq 'x'){$ry=-$ry}
    $k="{0:F2},{1:F2}" -f ($sym.SX+$rx),($sym.SY+$ry)
    $key="$($sym.REF).$($pin.NUM)"
    if($parent.ContainsKey($k)){$r=$k;while($parent[$r] -ne $r){$r=$parent[$r]};$pinNet[$key]=$r}
    else{$pinNet[$key]="__NC__$k"}
    $pinInfo[$key]=@{Ref=$sym.REF;Val=$sym.VAL;PinName=$pin.PNAME;Num=$pin.NUM}
  }
}
# ---------- net names: power symbols win, then labels ----------
$netName=@{}
foreach($sym in $placed){
  if($sym.LIB -notlike 'power:*'){continue}
  foreach($pin in $libPins[$sym.LIB]){
    $key="$($sym.REF).$($pin.NUM)"
    if($pinNet.ContainsKey($key)){$netName[$pinNet[$key]]=$sym.VAL}
  }
}
foreach($nm in $labelRoots.Keys){
  $r=$labelRoots[$nm];while($parent[$r] -ne $r){$r=$parent[$r]}
  if(-not $netName.ContainsKey($r)){$netName[$r]=$nm}
}

# ---------- merge islands that share a net NAME ----------
# KiCad net names are global: every "+3.3V" symbol is the same net even when the
# wires never touch. Without this the report splits one rail into many islands
# and the single-pin check fires on every one of them.
$nameToRoot=@{}
foreach($root in @($netName.Keys)){
  $nm=$netName[$root]
  $r=$root; while($parent.ContainsKey($r) -and $parent[$r] -ne $r){$r=$parent[$r]}
  if($nameToRoot.ContainsKey($nm)){
    $ra=$nameToRoot[$nm]; while($parent.ContainsKey($ra) -and $parent[$ra] -ne $ra){$ra=$parent[$ra]}
    if($ra -ne $r -and $parent.ContainsKey($ra)){$parent[$ra]=$r}
  }
  $nameToRoot[$nm]=$r
}
# re-resolve every pin after the merge, and re-apply names to the new roots
foreach($key in @($pinNet.Keys)){
  $r=$pinNet[$key]
  if($r -like '__NC__*'){continue}
  while($parent.ContainsKey($r) -and $parent[$r] -ne $r){$r=$parent[$r]}
  $pinNet[$key]=$r
}
$netName=@{}
foreach($nm in $nameToRoot.Keys){
  $r=$nameToRoot[$nm]; while($parent.ContainsKey($r) -and $parent[$r] -ne $r){$r=$parent[$r]}
  $netName[$r]=$nm
}

# ---------- build net -> members ----------
$nets=@{}
foreach($key in $pinNet.Keys){
  if($key -like '#*'){continue}          # skip power-symbol pseudo-pins
  $root=$pinNet[$key]
  if(-not $nets.ContainsKey($root)){$nets[$root]=New-Object System.Collections.ArrayList}
  [void]$nets[$root].Add($key)
}

# ============================ REPORT ============================
W ("=" * 78)
W "KiCad schematic netlist analysis"
W ("File : " + (Split-Path $Path -Leaf))
W ("Date : " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
W ("=" * 78)
$realParts = $placed | Where-Object { $_.REF -match '^[A-Z]+[0-9]+$' }
W ("Components : {0}" -f $realParts.Count)
W ("Wires      : {0}" -f $wx1.Count)
W ("Labels     : {0}" -f $labelRoots.Count)
W ("Nets       : {0}" -f $nets.Count)
W ""

W ("-" * 78)
W "NETS"
W ("-" * 78)
$named=@(); $unnamed=@()
foreach($root in $nets.Keys){ if($netName.ContainsKey($root)){$named+=$root}else{$unnamed+=$root} }
foreach($root in ($named | Sort-Object { $netName[$_] })){
  $mem = $nets[$root] | Sort-Object
  W ("{0}  ({1} pins)" -f $netName[$root], $mem.Count)
  foreach($p in $mem){ $inf=$pinInfo[$p]; W ("    {0,-8} pin {1,-4} {2,-14} [{3}]" -f $inf.Ref,$inf.Num,$inf.PinName,$inf.Val) }
  W ""
}
$idx=1
foreach($root in ($unnamed | Sort-Object { -($nets[$_].Count) })){
  $mem = $nets[$root] | Sort-Object
  W ("(unnamed net #{0})  ({1} pins)" -f $idx, $mem.Count); $idx++
  foreach($p in $mem){ $inf=$pinInfo[$p]; W ("    {0,-8} pin {1,-4} {2,-14} [{3}]" -f $inf.Ref,$inf.Num,$inf.PinName,$inf.Val) }
  W ""
}

W ("-" * 78)
W "SANITY CHECKS"
W ("-" * 78)
$single=@(); foreach($root in $nets.Keys){ if($nets[$root].Count -eq 1 -and $root -notlike '__NC__*'){$single+=$root} }
if($single.Count -eq 0){ W "OK  - no single-pin nets" } else {
  W ("WARNING - {0} net(s) with only ONE pin (usually a missed connection):" -f $single.Count)
  foreach($root in $single){ $p=$nets[$root][0]; $inf=$pinInfo[$p]
    $nm='(unnamed)'; if($netName.ContainsKey($root)){$nm=$netName[$root]}
    W ("    {0,-8} pin {1,-4} {2,-14} net={3}" -f $inf.Ref,$inf.Num,$inf.PinName,$nm) }
}
W ""
$nc=@(); foreach($key in $pinNet.Keys){ if($key -notlike '#*' -and $pinNet[$key] -like '__NC__*'){$nc+=$key} }
if($nc.Count -eq 0){ W "OK  - every pin sits on a wire" } else {
  W ("INFO - {0} pin(s) not on any wire (unused pins / no-connect):" -f $nc.Count)
  foreach($key in ($nc|Sort-Object)){ $inf=$pinInfo[$key]; W ("    {0,-8} pin {1,-4} {2}" -f $inf.Ref,$inf.Num,$inf.PinName) }
}
W ""
W ("-" * 78)
W "COMPONENTS"
W ("-" * 78)
foreach($s in ($realParts | Sort-Object { $_.REF -replace '[0-9]','' },{ [int]($_.REF -replace '\D','') })){
  W ("{0,-7} {1,-32} {2}" -f $s.REF,$s.VAL,$s.FP)
}

if($OutFile){
  $out | Out-File -FilePath $OutFile -Encoding utf8
  Write-Output ""
  Write-Output "Report written to: $OutFile"
}
