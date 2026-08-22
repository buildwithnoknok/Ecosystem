# ============================================================================
# kicad_pcb_check.ps1 - Structural / placement checker for .kicad_pcb (read-only)
#
# SPDX-License-Identifier: MIT
# Part of the noknok Ecosystem: https://github.com/buildwithnoknok/Ecosystem
#
# WHAT IT DOES
#   Parses a KiCad PCB file and reports the things worth eyeballing before fab:
#     - board outline (shape / size / centre)
#     - footprint layer split (F.Cu vs B.Cu) - the payload/MCU-side check
#     - vias, counted per net (power-transfer sizing)
#     - copper zones: net, layer(s), priority, pad-connection mode, filled?
#     - track widths overall and per power net
#     - decoupling proximity: every 2-pad cap -> nearest same-net IC pin
#       (is each bypass cap actually close to the pin it serves?)
#     - noknok flash-pad orientation: are the pogo pads keyed INWARD so a
#       flipped clamp can't seat reversed and back-power the board?
#
# USAGE
#   .\kicad_pcb_check.ps1 -Path "MyBoard.kicad_pcb"
#   .\kicad_pcb_check.ps1 -Path "MyBoard.kicad_pcb" -OutFile "pcb_report.txt"
#
# LIMITS - read before trusting a result
#   * NOT a DRC. It does not check clearances, spacing, courtyard overlaps,
#     unconnected pads, or manufacturing rules. Run KiCad's own DRC for that.
#   * Distances are pad-centre to pad-centre, computed from the footprint
#     placement + rotation. Validated against known 0603 pad spacing (~1.55mm),
#     so good to ~+/-0.2mm - enough to tell 2mm from 5mm, not for sub-mm work.
#   * Reads placement + tracks + zones + vias. Does not evaluate copper-fill
#     quality or thermal performance beyond reporting zone config.
#   If a result surprises you, verify it in KiCad before acting on it.
#
# TESTED ON  KiCad 10 .kicad_pcb (module-usb-led V2).
# ============================================================================
param(
  [Parameter(Mandatory=$true)][string]$Path,
  [string]$OutFile
)
$ErrorActionPreference='Stop'
$t=[System.IO.File]::ReadAllText($Path)
$out=New-Object System.Collections.ArrayList
function W($s){ [void]$out.Add($s); Write-Output $s }

# ---------------- parse footprints + pads (absolute positions) ----------------
$fps=@{}
$chunks=$t -split '\(footprint '
for($i=1;$i -lt $chunks.Count;$i++){
  $b=$chunks[$i]
  $ref=([regex]::Match($b,'\(property "Reference" "([^"]+)"')).Groups[1].Value
  if($ref -eq ''){continue}
  $lib=([regex]::Match($b,'^"([^"]+)"')).Groups[1].Value
  $val=([regex]::Match($b,'\(property "Value" "([^"]*)"')).Groups[1].Value
  $lay=([regex]::Match($b,'\(layer "([^"]+)"')).Groups[1].Value
  $atm=[regex]::Match($b,'\(at ([-\d.]+) ([-\d.]+)(?:\s+([-\d.]+))?\)')
  $fx=[double]$atm.Groups[1].Value; $fy=[double]$atm.Groups[2].Value
  $frot= if($atm.Groups[3].Success){[double]$atm.Groups[3].Value}else{0.0}
  $rad=[math]::PI*$frot/180.0; $cs=[math]::Cos($rad); $sn=[math]::Sin($rad)
  $pads=New-Object System.Collections.ArrayList
  foreach($pm in [regex]::Matches($b,'\(pad "([^"]*)"[^\r\n]*\r?\n?\s*\(at ([-\d.]+) ([-\d.]+)(?:\s+[-\d.]+)?\)(.*?)(?=\(pad "|\(model|\Z)',[Text.RegularExpressions.RegexOptions]::Singleline)){
    $px=[double]$pm.Groups[2].Value; $py=[double]$pm.Groups[3].Value
    $net=([regex]::Match($pm.Groups[4].Value,'\(net (?:\d+ )?"([^"]*)"')).Groups[1].Value
    $o=New-Object psobject
    $o|Add-Member NoteProperty NUM $pm.Groups[1].Value; $o|Add-Member NoteProperty NET $net
    $o|Add-Member NoteProperty AX ($fx + ($px*$cs - $py*$sn)); $o|Add-Member NoteProperty AY ($fy + ($px*$sn + $py*$cs))
    [void]$pads.Add($o)
  }
  $fps[$ref]=[pscustomobject]@{REF=$ref;VAL=$val;LIB=$lib;LAYER=$lay;X=$fx;Y=$fy;ROT=$frot;PADS=$pads}
}

W ("="*72)
W ("KiCad PCB check: " + (Split-Path $Path -Leaf))
W ("Date: " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
W ("="*72)

# ---------------- board outline ----------------
$bcx=$null;$bcy=$null
$circ=[regex]::Match($t,'\(gr_circle\s*\r?\n\s*\(center ([-\d.]+) ([-\d.]+)\)\s*\r?\n\s*\(end ([-\d.]+) ([-\d.]+)\).*?\(layer "Edge\.Cuts"',[Text.RegularExpressions.RegexOptions]::Singleline)
if($circ.Success){
  $bcx=[double]$circ.Groups[1].Value;$bcy=[double]$circ.Groups[2].Value
  $r=[math]::Sqrt(([double]$circ.Groups[3].Value-$bcx)*([double]$circ.Groups[3].Value-$bcx)+([double]$circ.Groups[4].Value-$bcy)*([double]$circ.Groups[4].Value-$bcy))
  W ("`nOUTLINE: round, dia {0}mm, centre ({1},{2})" -f [math]::Round($r*2,2),$bcx,$bcy)
} else {
  $ec=[regex]::Matches($t,'\(gr_line.*?"Edge\.Cuts"',[Text.RegularExpressions.RegexOptions]::Singleline).Count
  W ("`nOUTLINE: not a single circle - {0} Edge.Cuts line segments (rectangular/polygon)" -f $ec)
}

# ---------------- layer split ----------------
$fcu=($fps.Values|?{$_.LAYER -eq 'F.Cu'}).Count; $bcu=($fps.Values|?{$_.LAYER -eq 'B.Cu'}).Count
W ("`nFOOTPRINTS: {0} total  |  F.Cu={1}  B.Cu={2}" -f $fps.Count,$fcu,$bcu)
W ("  B.Cu: " + (($fps.Values|?{$_.LAYER -eq 'B.Cu'}|%{$_.REF}|Sort-Object {[int]($_ -replace '\D','')}) -join ', '))

# ---------------- vias per net ----------------
W "`nVIAS (per net):"
$vc=$t -split '\(via\b'; $vn=@{}
for($i=1;$i -lt $vc.Count;$i++){ $nn=([regex]::Match($vc[$i],'\(net (?:\d+ )?"?([^"\)]*)"?\)')).Groups[1].Value; if($nn -eq ''){$nn='(none)'}; if(-not $vn.ContainsKey($nn)){$vn[$nn]=0}; $vn[$nn]++ }
$vn.GetEnumerator()|Sort-Object {-$_.Value}|%{ W ("  {0,-16} {1}" -f $_.Key,$_.Value) }

# ---------------- zones ----------------
W "`nCOPPER ZONES:"
$zc=$t -split '\(zone\b'
for($i=1;$i -lt $zc.Count;$i++){
  $b=$zc[$i]
  $net=([regex]::Match($b,'\(net "([^"]*)"')).Groups[1].Value
  $nm=([regex]::Match($b,'\(name "([^"]*)"')).Groups[1].Value
  $laym=[regex]::Match($b,'\(layers ([^\)]+)\)'); $lay1=[regex]::Match($b,'\(layer "([^"]+)"')
  $layers= if($laym.Success){$laym.Groups[1].Value -replace '"',''}else{$lay1.Groups[1].Value}
  $prio=([regex]::Match($b,'\(priority (\d+)\)')).Groups[1].Value; if($prio -eq ''){$prio='0'}
  $cp=[regex]::Match($b,'\(connect_pads(\s+\w+)?\s*\r?\n?\s*\(clearance')
  $cpmode= if($cp.Groups[1].Value.Trim() -eq ''){'THERMAL'}elseif($cp.Groups[1].Value.Trim() -eq 'yes'){'SOLID'}elseif($cp.Groups[1].Value.Trim() -eq 'no'){'NONE'}else{$cp.Groups[1].Value.Trim().ToUpper()}
  $fp=([regex]::Matches($b,'\(filled_polygon')).Count
  $fill= if($fp -gt 0){"filled($fp)"}else{"NOT FILLED"}
  W ("  '{0}'  net={1}  layers={2}  priority={3}  pad-connect={4}  {5}" -f $nm,$net,$layers,$prio,$cpmode,$fill)
}

# ---------------- track widths ----------------
W "`nTRACK WIDTHS:"
$segs=New-Object System.Collections.ArrayList
$sc=$t -split '\(segment'
for($i=1;$i -lt $sc.Count;$i++){ $b=$sc[$i]; $w=([regex]::Match($b,'\(width ([-\d.]+)\)')).Groups[1].Value; $nn=([regex]::Match($b,'\(net "([^"]*)"')).Groups[1].Value; if($w -eq ''){continue}; $o=New-Object psobject;$o|Add-Member NoteProperty W ([double]$w);$o|Add-Member NoteProperty NET $nn;[void]$segs.Add($o) }
$segs|Group-Object W|Sort-Object {[double]$_.Name}|%{ W ("  {0}mm x {1}" -f $_.Name,$_.Count) }
W "  by power net (min..max):"
foreach($pn in @('+5V','+5V_LED','+4.65V','+3.3V','GND')){ $ss=$segs|?{$_.NET -eq $pn}; if($ss.Count -gt 0){ $ws=$ss|%{$_.W}; W ("    {0,-9} {1} segs  {2}..{3}mm" -f $pn,$ss.Count,($ws|Measure-Object -Minimum).Minimum,($ws|Measure-Object -Maximum).Maximum) } }

# ---------------- decoupling proximity (generic) ----------------
# For every 2-pad cap, measure its power pad (the non-GND pad) to the NEAREST
# same-net pad on any OTHER footprint, and report what it matched. This finds
# how close each bypass/bulk cap sits to the thing it connects to, without
# guessing which pin it "belongs" to - interpret the matched ref:pin yourself
# (a bulk cap may correctly match a FET/regulator pad or a neighbouring cap).
W "`nDECOUPLING PROXIMITY (2-pad cap power-pad -> nearest same-net pad, pad-to-pad):"
$caps=$fps.Values|?{$_.REF -match '^C\d' -and $_.PADS.Count -eq 2}
$rows=@()
foreach($c in $caps){
  foreach($cp in $c.PADS){
    if($cp.NET -eq '' -or $cp.NET -eq 'GND'){continue}   # measure the power pad, not GND
    $best=[double]::MaxValue;$bic='';$bpin=''
    foreach($other in $fps.Values){ if($other.REF -eq $c.REF){continue}
      foreach($ip in $other.PADS){ if($ip.NET -eq $cp.NET){ $d=[math]::Sqrt(($cp.AX-$ip.AX)*($cp.AX-$ip.AX)+($cp.AY-$ip.AY)*($cp.AY-$ip.AY)); if($d -lt $best){$best=$d;$bic=$other.REF;$bpin=$ip.NUM} } } }
    if($bic -ne ''){ $rows += [pscustomobject]@{Cap=$c.REF;Net=$cp.NET;IC=$bic;Pin=$bpin;D=[math]::Round($best,2)} }
  }
}
foreach($r in ($rows|Sort-Object {-$_.D})){ $flag= if($r.D -le 2){'OK  '}elseif($r.D -le 3.5){'ok  '}else{'FAR '}; W ("  {0} {1,-4} [{2,-20}] -> {3} pad {4}  = {5}mm" -f $flag,$r.Cap,$r.Net,$r.IC,$r.Pin,$r.D) }

# ---------------- noknok flash-pad orientation (keying) ----------------
W "`nFLASH-PAD ORIENTATION (keyed inward?):"
if($null -eq $bcx){ W "  (no round outline centre found - skipping)" }
else {
  $fpz=$fps.Values|?{$_.LIB -match 'FlashPads'}
  if($fpz.Count -eq 0){ W "  (no noknok FlashPads footprint found)" }
  foreach($f in $fpz){
    # pad centroid
    $cx=($f.PADS|Measure-Object AX -Average).Average; $cy=($f.PADS|Measure-Object AY -Average).Average
    $rHole=[math]::Sqrt(($f.X-$bcx)*($f.X-$bcx)+($f.Y-$bcy)*($f.Y-$bcy))
    $rPads=[math]::Sqrt(($cx-$bcx)*($cx-$bcx)+($cy-$bcy)*($cy-$bcy))
    $inward = $rPads -lt $rHole
    $verdict= if($inward){"INWARD (keyed OK)"}else{"OUTWARD - pads toward edge, keying/clearance RISK"}
    W ("  {0} ({1}) hole r={2}mm  pads r={3}mm  edge-gap~{4}mm  -> {5}" -f $f.REF,$f.LAYER,[math]::Round($rHole,2),[math]::Round($rPads,2),[math]::Round(20-$rPads,2),$verdict)
  }
}

W "`n(pad-to-pad estimates; NOT a DRC/clearance check - run KiCad DRC before fab.)"
if($OutFile){ $out|Out-File -FilePath $OutFile -Encoding utf8; Write-Output "`nReport written to: $OutFile" }
