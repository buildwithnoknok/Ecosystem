# noknok Housing Configurator

A browser-based tool that generates a 3D-printable housing for a set of noknok modules.
You place modules on a 2D grid, shape a box around them, and the tool builds **one uniform
box** — a front (top) cover and a back (bottom) cover — and exports it as STL. Runs 100 %
client-side (no server, no backend), so it's hosted directly on GitHub Pages.

- **Live tool:** <https://buildwithnoknok.github.io/configurator/>
- **How-to guide:** <https://buildwithnoknok.github.io/housing-configurator/>

## What it makes

A single monolithic box of uniform height:

- **Front + back cover** with a payload opening in the front for each module (buzzer grille,
  knob shaft, button, LED window, display window).
- **Per-module retention** at the M2.5 mounting holes: a front post and a back post clamp the
  PCB, with a short (1.6 mm) centred peg that locates the board and pulls out cleanly on
  disassembly. A **collar** (well-wall around the opening) retains recessed boards whose mount
  holes sit under the payload opening (e.g. the LED button), so no post blocks the opening.
- **Support columns** under the JST-SH sockets so the board is braced at all four corners.
- **USB-C power slot** — an open U-notch at the cover parting line; the plug is fitted to the
  module first and only the bare cable is laid into the slot before closing.
- **Cover latches** — flexing snap arms (tapered base) on user-picked walls; press from outside
  to release. Nothing internal is trapped.
- **2 mm clearance** between each module and the outer wall for easy assembly.
- **Engraved text labels** on the top cover (built-in single-stroke font), along a chosen module
  edge; the labelled tiles are reserved so no module can sit under the text.

Modules can't overlap. The **Download STL** button exports both covers; **top cover** / **bottom
cover** buttons export each on its own (they're also separate disconnected bodies in the combined
file, so a slicer's "Split to objects/parts" separates them for printing individually or in
different colours).

## noknok Dome Mount ø44 (screw-on tops)

The **USB LEDs +dome** variant is a 50 × 50 mm housing whose top cover carries a coarse, jam-jar-style
**external thread** (the "jar") so custom tops — a diffuser dome or any other top — screw over it. This
is a published interface: design a lid with the matching internal thread and it fits.

| Parameter | Value |
|---|---|
| Thread major ø (neck crest) | **44 mm** |
| Thread minor ø (neck root) | 41 mm (1.5 mm radial depth) |
| Starts / lead | 3-start, 15 mm lead (5 mm crest spacing) — seats in ~⅔ turn |
| Neck height | 10 mm, ø38 mm clear bore for the light |
| Fit clearance | 0.4 mm radial (lid thread grown by this) |
| Lid outer ø | ~48.4 mm (stays inside the 50 mm footprint) |

The tool exports a **reference dome lid** (`⬇ reference dome lid`, print in translucent filament) — the
easiest starting point for a custom top. Thread params live in the `DOME` constant in `main.js`
(`threadSolid` / `domeNeck` / `referenceDome`). **Note:** thread fit always wants one test print to dial
in the clearance; the dome-mount cover prints **neck-up** (it can't go plate-down) so expect light
support/bridging under the frame.

## Module library

The module footprints, clearances, mount holes, connectors and top openings live in the `MODULES`
table in `main.js`, mirroring each module repo's **housing profile**
(`mechanical/housing.json`, spec: [`../housing-profile.md`](../housing-profile.md)).
Currently: buzzer, knob, LED button (20 × 20), USB LEDs (40 × 40), display (40 × 30).

## Files

- `index.html` — the page shell (UI + styling).
- `main.js` — app code + parametric geometry (**edit this**).
- `app.js` — the **built bundle** (three.js + JSCAD + app), committed so the tool is self-contained.
- `package.json` — deps + build script.
- `V1/ … V6/` — frozen version snapshots (also `git tag housing-configurator-v1 … -v6`).

## Build

Libraries are bundled with esbuild — **no CDN at runtime**, so it works offline and on GitHub Pages.
After changing `main.js`:

```
npm install      # first time only
npm run build    # regenerates app.js (minified)
```

`npm run dev` runs a watching dev server. To deploy: copy `index.html` + `app.js` to the website
repo's `configurator/` folder and commit.

## Status

**V6** — print-validated monolithic box, published for customers. Started 2026-07-05
(V1 fixed grid → V2 drag-and-drop → V3/V4 snap-together tiles → **V5/V6 monolithic box**).

## License

Unlike the rest of this repository (hardware/docs = CC BY-SA 4.0), the configurator is
**software → MIT** (`SPDX-License-Identifier: MIT`, declared in the source).
