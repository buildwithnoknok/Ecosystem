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
- **Cable hooks** — **open half-arcs** on the bottom cover, placed on empty in-box tiles (toggle to
  "cable hook" mode; click a tile to add, click again to rotate, a full turn removes). Only the near
  foot reaches the plate; the far end is free, so you lay a cable in from the open side (a closed arch
  would trap it — a fitted plug can't thread through). These are an **assembly aid** for holding cable
  slack while the box is closed; a little droop at the free end and later loosening don't matter.
- **2 mm clearance** between each module and the outer wall for easy assembly.
- **Engraved text labels** on the top cover (built-in single-stroke font, bold, 0.8 mm deep),
  along a chosen module edge; the labelled tiles are reserved so no module can sit under the text.
  Mirrored in the print build so they read correctly on the face-down-printed cover.

Modules can't overlap. The **Download STL** button exports both covers; **top cover** / **bottom
cover** buttons export each on its own (they're also separate disconnected bodies in the combined
file, so a slicer's "Split to objects/parts" separates them for printing individually or in
different colours).

## Joining two boxes (dovetails + cable openings)

Two separately-printed boxes can be joined side by side. You design each box on its own and match the
feature positions yourself (the 10 mm grid keeps that simple). All three are **wall clicks** under
*Join to another box*:

- **Male dovetail** — a vertical trapezoidal rail fused to the *outside* of a wall. Prints as a clean
  vertical rail (the undercut is horizontal, so no supports).
- **Female dovetail** — a solid boss grown *inward* from the wall (it reserves that tile, so no module
  sits there), with the matching groove carved in and cut up **through the top plate** so the other
  box's rail drops in from above.
- **Cable opening** — most of a wall segment removed at the floor line (front plate left as a lintel),
  so a cable passes between the two boxes. Lay the cable in, then close the covers.

**Assembly:** put the male rail on one box and the female groove at the mirror position on the other,
then **slide the second box straight down** onto the first. The dovetail locks the boxes against pulling
apart sideways; they lift straight up to separate (no tools, nothing to break). Line up a cable opening
on each box to route wiring between them — keep joins off the power/latch walls. Dovetail dimensions
live in the `DT` constant in `main.js` (neck/tip widths, depth, print clearance) and want a test print
to tune the slide fit.

## noknok Dome Mount ø58 (screw-in tops)

The **USB LEDs +dome** variant is a 70 × 70 mm housing (the tile is oversized so the ~62 mm ring can't
overlap a neighbouring module). Its top cover carries a coarse, jam-jar-style
**female (internal) thread ring that projects DOWN into the box** — same direction as the walls/columns,
so the **cover prints flat on the bed with no supports**. A lid (dome) with the matching **male thread
screws IN** from the top. This is a published interface: design a lid with the matching male thread and it
fits.

| Parameter | Value |
|---|---|
| Thread major ø (male crest) | **59.5 mm** |
| Ring bore / female crest ø | ~57.9 mm (the 40 × 40 board, 56.6 mm diagonal, sits inside) |
| Starts / lead | 3-start, 7.5 mm lead (2.5 mm crest spacing) — seats in ~⅔ turn |
| Ring height (into the box) | 6 mm, 1.2 mm radial tooth |
| Fit clearance | 0.4 mm radial |
| Ring outer ø | ~62 mm (well inside the 70 mm tile) |
| Lid globe ø | ~69 mm (fills the 70 mm tile) |

The board is smaller than the light opening, so it isn't held by front columns — it rests on the tall
back-cover posts (gravity + locating pegs; a firmer snap can be added). The tool exports two matching
screw-in lids: **⬇ reference dome lid** (`referenceDome`, print translucent) and **⬇ honeycomb dome lid**
(`referenceDomeHoney`, hex-perforated for any opaque filament). Thread params live in the `DOME` constant
in `main.js` (`threadSolid` / `domeRing`). **Note:** thread fit always wants one test print to tune the
clearance; the internal thread prints with modest overhangs (coarse pitch bridges fine).

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
- `V1/ … V7/` — frozen version snapshots (also `git tag housing-configurator-v1 … -v7`).

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

**V7** — monolithic box + **box-joining** (dovetails & cable openings between two boxes). Started
2026-07-05 (V1 fixed grid → V2 drag-and-drop → V3/V4 snap-together tiles → V5/V6 monolithic box →
**V7 box-joining**). The join geometry is print-untested — tune the `DT` slide fit after a test print.

## License

Unlike the rest of this repository (hardware/docs = CC BY-SA 4.0), the configurator is
**software → MIT** (`SPDX-License-Identifier: MIT`, declared in the source).
