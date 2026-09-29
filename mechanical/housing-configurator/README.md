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
- **Cable hooks** — **mushrooms** on the bottom cover, placed on empty in-box tiles (toggle to "cable
  hook" mode; click a tile to add, click again to remove). A wide base, a strong stem, and a thick cap
  whose lip catches a cable wrapped or tucked around the stem. Radially symmetric (no orientation) and a
  solid of revolution, so it's strong and prints **without support** — the base narrows going up, the
  stem is vertical, and the only overhang is the cap's ~45° underside cone. These are an **assembly aid**
  for holding cable slack while the box is closed; the cable may loosen afterwards, which is fine.
- **2 mm clearance** between each module and the outer wall for easy assembly.
- **Engraved text labels** on the top cover (built-in single-stroke font, bold, 0.8 mm deep),
  along a chosen module edge; the labelled tiles are reserved so no module can sit under the text.
  Mirrored in the print build so they read correctly on the face-down-printed cover.

- **noknok branding** — the noknok square logo (two-line "nok/nok") is **debossed** on the top cover in a
  1×1 tile. It's **on by default** (dropped into a spare tile) but **opt-out** — click an empty in-box tile
  in *noknok logo* mode to move it, or click it again to remove it. Not a hard gate: a design with no free
  tile just goes un-branded. The mark is a flattened vector of `brand/logo/noknok-square-blackpurple.svg`
  (baked into `logo-data.js`, regenerated via `logo-data.gen.mjs`).
- **Save / load** — the 2D layout can be saved to a `.json` file (plain text: modules, box shape,
  power/latch, dovetails, cable openings, labels, cable mushrooms) and loaded back later to keep editing
  or to share a design. Loading is tolerant — it rejects non-noknok files and skips any module key the
  build doesn't recognise.

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

## noknok Dome Mount ø58 and ø44 (screw-in tops)

Two dome sizes, one per LED module: **USB LEDs +dome** (the 40 × 40 8-LED board, 70 × 70 tile, ø58 dome)
and **USB LEDs 16x +dome** (the round ø40 16-LED board, 50 × 50 tile, ø44 dome). Each top cover carries
a coarse, jam-jar-style **female (internal) thread ring that runs from the outer face DOWN into the box**
— same direction as the walls/columns, so the **cover prints flat on the bed with no supports**. A lid
(dome) with the matching **male thread screws IN** from the top. These are published interfaces: design
a lid with the matching male thread and it fits.

| Parameter | ø58 (USB LEDs) | ø44 (USB LEDs 16x) |
|---|---|---|
| Thread major ø (male crest) | **59.5 mm** | **44.0 mm** |
| Female minor ø | ~57.9 mm (board, 56.6 mm diagonal, sits inside) | ~42.4 mm (board sits just below, on the lip) |
| Starts / lead | 3-start, 7.5 mm lead (2.5 mm crest spacing) — seats in ~⅔ turn | same |
| Ring height | 6 mm from the outer face (1.2 plate + 4.8 into the box), 1.2 mm tooth | same |
| Fit clearance | 0.4 mm radial | same |
| Ring outer ø | ~62 mm | ~46.6 mm |
| Lid globe ø / light bore ø | ~69 / 53.5 mm | ~49 / 38 mm |
| Board retention | back posts + pegs (gravity) | **clamp lip**: 0.6 mm annulus under the ring (inner ø38) presses the board's edge band onto the back posts; also the lid's thread stop |

**Fixed 2026-09-29:** the ring used to sit entirely *under* the 1.2 mm top plate, which had a ø58 hole —
smaller than the ø59.5 lid crest, so the lid could never reach the thread. The ring's top is now flush
with the outer face and the plate hole is cut just wider than the female thread (`domeCutR`), so the
thread starts at the surface. The lids themselves did not change.

**Why the 16x board sits *below* its ring:** the USB-C and JST plugs enter at the board edge, and a
USB-C plug overmold reaches up to about the PCB front. Inside the ring (like the ø58), the plugs would
hit the ring wall. Below it, they pass under it. It costs ~5 mm of box height.

The tool exports matching screw-in lids for whichever dome(s) are in the design: **⬇ reference dome lid**
(`referenceDome`, print translucent) and **⬇ honeycomb dome lid** (`referenceDomeHoney`, hex-perforated
for any opaque filament). Thread params live in the `DOMES` table in `main.js` (`threadSolid` /
`domeRing`). **Note:** thread fit always wants one test print to tune the clearance; the internal thread
prints with modest overhangs (coarse pitch bridges fine), the ø44 lip is a ~2 mm flat ledge.

## Module library

The module footprints, clearances, mount holes, connectors and top openings live in the `MODULES`
table in `main.js`, mirroring each module repo's **housing profile**
(`mechanical/housing.json`, spec: [`../housing-profile.md`](../housing-profile.md)).
Currently: buzzer, knob, LED button (20 × 20), USB LEDs (40 × 40, +dome 70 × 70), USB LEDs 16x
(round ø40 in a 40 × 40 tile, +dome 50 × 50), display (40 × 30, re-checked against rev 1.1 — unchanged),
PicoHub (60 × 40).

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
