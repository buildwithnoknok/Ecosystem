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

## License

MIT — see the SPDX header in each script.
