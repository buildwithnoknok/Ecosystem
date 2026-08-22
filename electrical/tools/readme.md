# noknok ECAD Tools

Small helper scripts for designing and reviewing noknok module hardware in KiCad.

All scripts are PowerShell (Windows) and **read-only** — they never modify your design files.

---

## `kicad_netlist.ps1` — schematic netlist extractor & sanity checker

Reconstructs the full netlist directly from a `.kicad_sch` file and reports every net with its member pins, so you can answer *"is this pin actually connected to what I think it is?"* without clicking through the schematic.

### Usage

```powershell
# print the report
.\kicad_netlist.ps1 -Path "MyModule.kicad_sch"

# also write it to a file
.\kicad_netlist.ps1 -Path "MyModule.kicad_sch" -OutFile "netlist_analysis.txt"
```

KiCad does **not** need to be installed — the script parses the schematic file directly.

### What you get

1. **Summary** — component, wire, label and net counts.
2. **All nets**, named ones first (`GND`, `+3.3V`, …), each listing every connected pin with its component reference, pin number, pin name and value:

   ```
   +5V  (12 pins)
       C29      pin 1                   [22µF 25V X5R]
       F1       pin 1                   [Polyfuse at >= 1.5A]
       Q1       pin 2    S              [AO3401A]
       U3       pin 5    VCC            [SN74AHCT1G125DBVR]
       ...
   ```

3. **Sanity checks:**
   - **Single-pin nets** — a net with only one pin is almost always a missed connection. This is the check that catches real bugs.
   - **Pins on no wire** — unused/no-connect pins. Expected for spare GPIO and chain ends; review the list to confirm nothing is missing.

4. **Component list** with values and footprints.

### How it works

1. Unions wire segments into nets, including endpoints that land mid-segment on another wire (which KiCad treats as connected).
2. Merges nets joined by a shared label, and nets sharing a global net name — every `+3.3V` symbol is one net even where the wires never touch.
3. Computes each symbol pin's absolute position from the library definition plus the instance's placement, rotation and mirroring, then snaps it onto the net graph.
4. Names nets from power symbols first, then from labels.

### Limits — read before trusting a result

- **Not a replacement for KiCad's ERC.** It knows nothing about pin electrical types, power-input rules, or the PCB.
- Sees only wires, labels, power symbols and pin geometry. **Buses, bus entries and hierarchical sheets are not handled.**
- If a result surprises you, **verify it in KiCad before acting on it.**

Tested on KiCad 10 schematics.

---

## `kicad_pcb_check.ps1` — PCB structural & placement checker

Parses a `.kicad_pcb` and reports the things worth eyeballing before fab — the layout counterpart to the netlist checker. Answers *"is the board the right shape, are the caps close to their pins, are the pours and vias set up right, is the flash pad keyed correctly?"* without hunting through the PCB editor.

### Usage

```powershell
.\kicad_pcb_check.ps1 -Path "MyBoard.kicad_pcb"
.\kicad_pcb_check.ps1 -Path "MyBoard.kicad_pcb" -OutFile "pcb_report.txt"
```

KiCad does **not** need to be installed.

### What you get

1. **Board outline** — round (dia + centre) or rectangular/polygon.
2. **Footprint layer split** — F.Cu vs B.Cu counts, and the list of B.Cu parts (the payload-side / MCU-side check).
3. **Vias per net** — for sizing power-transfer between layers (e.g. is the LED rail carried by enough vias, and does the ground return match?).
4. **Copper zones** — each zone's net, layer(s), priority, **pad-connection mode (SOLID / THERMAL / NONE)**, and whether it's actually filled. Catches an unfilled pour, a heatsink zone left on thermal relief, or a priority that lets GND swallow a power pour.
5. **Track widths** — overall distribution and min/max per power net.
6. **Decoupling proximity** — every 2-pad cap's power pad to the nearest same-net pad on another footprint, flagged OK (≤2mm) / ok (≤3.5mm) / FAR. Confirms bypass caps sit close to what they serve. *Interpret the matched ref:pin — a bulk cap may correctly match a neighbouring cap or a FET pad rather than an IC.*
7. **noknok flash-pad orientation** — checks the pogo pads are keyed **inward** (hole toward the board corner, pads toward centre) so a 180°-flipped clamp can't seat reversed and back-power the board. Reports each flash footprint's hole radius, pad radius, edge gap, and INWARD/OUTWARD verdict.

### Limits — read before trusting a result

- **Not a DRC.** It does not check clearances, spacing, courtyard overlaps, unconnected pads, or manufacturing rules. **Run KiCad's own DRC before generating fab files** — this tool complements it, never replaces it.
- Distances are pad-centre to pad-centre from the footprint placement + rotation, validated against known 0603 spacing (~1.55mm) → good to ~±0.2mm. Fine for "2mm vs 5mm", not for sub-mm work.
- Reports zone *config*, not copper-fill quality or actual thermal performance.
- If a result surprises you, **verify it in KiCad before acting on it.**

Tested on KiCad 10 PCBs.

---

## License

MIT — see the SPDX header in each script.
