# noknok Housing Configurator

A browser-based tool that generates 3D-printable housings for noknok modules.
Users pick modules and a count; the tool assembles one snap-fit shell (with a bay
per module, tool-less mushroom snap-pins, connector channels and top-face features)
and exports an STL. Runs 100% client-side — no server, no backend — so it can be
hosted directly on GitHub Pages.

It reads each module's **housing profile** (`mechanical/housing.json` in the module
repo, spec: [`../housing-profile.md`](../housing-profile.md)).

## Status

**Proof of concept** — single module type (buzzer), N copies tiled in a row.
Open `index.html` (see below). Roadmap: v1 fixed grid → v2 free drag-and-drop on
the 10 mm grid → v3 per-module top-face features → v4 print-bed auto-tiling.

## Run it

It's a single static file. Either:

- **Double-click `index.html`** (loads its libraries from the esm.sh CDN), or
- serve the folder over http and open `localhost` (any static server).

Once Node is available we'll bundle the libraries (three.js, JSCAD) into the repo
so the tool no longer depends on a CDN at runtime.

## License

Unlike the rest of this repository (hardware/docs = CC BY-SA 4.0), the configurator
is **software → MIT** (`SPDX-License-Identifier: MIT`, declared in `index.html`).
