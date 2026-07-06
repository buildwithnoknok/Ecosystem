# noknok Housing Configurator

A browser-based tool that generates 3D-printable housings for noknok modules.
Users pick modules and a count; the tool assembles one snap-fit shell (a bay per
module, edge-ledge PCB support + snap-lips, bottom cable notches, a floor push-out
hole, and a lid that snap-fits over the base) and exports an STL. Runs 100%
client-side — no server, no backend — so it can be hosted directly on GitHub Pages.

It reads each module's **housing profile** (`mechanical/housing.json` in the module
repo, spec: [`../housing-profile.md`](../housing-profile.md)).

## Status

**Proof of concept** — single module type (buzzer), N copies tiled in a row.
Roadmap: v1 fixed grid → v2 free drag-and-drop on the 10 mm grid → v3 per-module
top-face features → v4 print-bed auto-tiling.

## Files

- `index.html` — the page shell (UI + styling).
- `main.js` — app code + parametric geometry (edit this).
- `app.js` — **built bundle** (three.js + JSCAD + app), committed so the tool is
  self-contained. Regenerate after editing `main.js` (see Build).
- `package.json` — deps + build script.

## Build

Libraries are bundled with esbuild — **no CDN at runtime**, so it works offline and
on GitHub Pages. After changing `main.js`:

```
npm install      # first time only
npm run build    # regenerates app.js
```

`npm run dev` runs a watching dev server. To run without building, just serve the
folder (any static server) or open `index.html` — it loads the local `app.js`.

## License

Unlike the rest of this repository (hardware/docs = CC BY-SA 4.0), the configurator
is **software → MIT** (`SPDX-License-Identifier: MIT`, declared in the source).
