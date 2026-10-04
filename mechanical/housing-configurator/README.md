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

## noknok Dome Mount ø58 and ø44 (bayonet tops)

Two dome sizes, one per LED module: **USB LEDs +dome** (the 40 × 40 8-LED board, 70 × 70 tile, ø58 dome)
and **USB LEDs 16x +dome** (the round ø40 16-LED board, 50 × 50 tile, ø44 dome). Since 2026-10-04 the lid
locks with a **3-lug bayonet: drop it in where the slots line up, twist 30° clockwise, it clicks.** It
replaced the jam-jar thread, which did not fit on the first print: the female thread prints upside down in
the top cover, its teeth sag, and a 0.4 mm gap can't absorb that. A bayonet is much more forgiving across
printers. These are published interfaces: a lid with the same tube, lugs path and cone fits.

How it works (all parts print **without support**):
- **Top cover** (prints plate-down): a bore through the plate with a **45° countersink** at the outer face,
  a collar ring below the plate and **3 lugs** pointing inward (45° chamfered top, flat underside, a small
  detent bump). On the ø44 the collar continues down to a **45° seat** that presses the board's r 19–20
  edge band onto the back posts — it replaces the old flat clamp lip, which was a hanging ledge and strung.
- **Lid** (prints tube-down): a bored tube with 3 vertical entry slots and 3 grooves. The lid's 45° cone
  sits in the countersink — that centres it and is its stop. The groove floor ramps up over the twist,
  pulling the lid down into the countersink; the bump drops into a dimple at the end (the click).
- **Top shape:** the globe rises to 45° and then continues as a **45° cone to a point** (no flat,
  overhanging top — the round top strung on the print). The ø44 lid is ~41 mm tall.

| Parameter | ø58 (USB LEDs) | ø44 (USB LEDs 16x) |
|---|---|---|
| Lid light bore ø / tube OD | 57.6 / 63.6 mm (clears the board corners) | 38 / 44 mm (no LED shaded) |
| Cover bore ø / countersink ø at the face | 64.4 / 66.4 mm | 44.8 / 46.8 mm |
| Lugs | 3 × 15°, 1.8 mm deep, twist 30° | same |
| Radial clearance | 0.4 mm (tube vs bore); ramp slack 0.8 → 0.15 mm | same |
| Lid globe ø | 69 mm | 49 mm |
| Board retention | back posts + pegs | **45° seat** at 9.0 mm below the face (clearance_top 7.8) |
| Inner diffuser | – | optional, separate print (see below) |

**Inner diffuser (ø44, optional):** **⬇ inner diffuser** exports a smaller cone-topped globe in 0.8 mm
walls on a short tube with a flat flange. Print it in thin white filament, drop it into the bore before
the lid: the flange rests on the seat chamfer and the lid's tube end clamps it as you twist. It makes the
whole inner shell glow evenly behind a honeycomb lid. Leaving it out changes nothing else.

The tool exports, for whichever dome(s) are in the design: **⬇ reference dome lid** (`referenceDome`,
print translucent), **⬇ honeycomb dome lid** (`referenceDomeHoney`, hex holes sized from the globe, any
filament) and **⬇ inner diffuser** (`domeDiffuser`). Sizes live in `DOMES`, the bayonet tuning in `BAYO`
(clearance, lug size, twist, ramp slack, detent bump) in `main.js`. Not print-validated yet — the click
(`BAYO.bump`) and the ramp slack are the numbers to tune.

**Open:** on the ø58 the 8x module's USB-C and JST plug overmolds rise to about the PCB front, right where
the collar and the lid tube sit (this was already true of the old thread ring). Check before printing one.

## Bottom-cover locating wall

The bottom cover carries a low **1.4 mm × 2 mm wall** just inside the top cover's walls (0.25 mm gap). It
centres the two halves, stiffens the flat bottom plate and closes the seam. It is interrupted at latches,
USB-C cable notches, cable openings and female dovetails. Tuning: `BOX.locWall`.

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
