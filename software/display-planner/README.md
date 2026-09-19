# noknok Display Planner

A browser tool for makers building with the **noknok Display**: lay out the screen as named
regions, turn any picture into a 1-bit icon, see a **pixel-true preview**, and copy the
`noknok.py` code straight into `product.py`. Runs 100 % client-side (no server, nothing is
uploaded), so it is hosted directly on GitHub Pages — same spirit as the
[Housing Configurator](../../mechanical/housing-configurator/).

- **Live tool:** <https://buildwithnoknok.github.io/display-planner/>
- **How-to guide:** <https://buildwithnoknok.github.io/display-planner-guide/>
- **Runtime it targets:** `brain-Pico/software/noknok.py` ≥ 1.9 — `d.region()` / `d.set()` /
  `d.icon()` / `d.image()` (Jira DEV-41). The tool is DEV-43.

## What it does

### Layout tab — the display / region planner
- Pick the display (**noknok Display 1.42″, 80 × 160** — or a custom size up to 255 × 255) and
  its orientation (portrait / landscape, also flipped → `d.rotation(n)`).
- **Drag rectangles** on the enlarged display to create regions; move / resize with the mouse
  or nudge with the arrow keys. Every region has a name, a text/icon size, a colour, a box
  background and an alignment — exactly the arguments of `d.region()`.
- Give each region **text**, an **icon** (built-in or your own) or an **image** (drop a
  PNG/JPG/SVG/BMP; it is converted to 1-bit at the box size).
- The preview is drawn by `render.js`, a port of noknok.py's own drawing rules (module 8×8
  font vs Pico 8×16 font, cell widths, wrapping, clipping, icon scaling, alignment), so what you
  see is what the panel shows.
- **Checks:** how many columns × lines a text box gives at its size, text that doesn't fit,
  overlapping regions, regions inside the `d.print()` band, missing icons, bad names.
- **Export:** the Python snippet (copy / download), the `.bmp` files for image regions, and a
  `layout.json` you can reload later or share. The layout is also autosaved in the browser.

### Icons tab — the image → icon converter / pixel editor
- Draw on a pixel grid (pen / eraser / fill, invert, flip, rotate, shift), or **import an
  image**: choose the target size, fit / stretch / crop, brightness or transparency as the
  source, a threshold, optional Floyd–Steinberg dither, invert.
- Preview at **1:1** (≈ real size on a monitor — the 1.42″ panel is ~127 ppi), 2:1 and 4:1,
  tinted in any noknok colour.
- **Export** as the `ICONS["name"] = [...]` snippet (the same ASCII-art form noknok.py's
  built-in icons use — `#` = lit), as a **1-bit `.bmp`** for `d.image()`, or as a PNG.
- Saved icons live in "my icons" (browser storage) and appear in the Layout tab's icon list;
  the Python export includes the definitions of every icon a layout uses.

## Output formats (the contract with noknok.py)

| Thing | Form | Consumed by |
|---|---|---|
| Icon | `ICONS["name"] = ["..##..", ...]` — rows of `#`/`.` | `d.icon("name")`, `d.set(r, icon="name")` |
| Small image | `Bitmap.from_rows([...])` inline in the code | `d.set(r, image=<Bitmap>)` |
| Big image | uncompressed 1-bpp Windows BMP (`/pics/name.bmp`) | `d.image(path)`, `d.set(r, image=path)` |
| Layout | `d.clear(...)`, `d.region(...)` per box, `d.set(...)` starter content | product.py |

Colours are emitted as noknok constants (`YELLOW`, `NOKNOK`, …) when named, else `0xRRGGBB`.
Parameters equal to noknok.py's defaults are omitted, so the snippet stays short.

## Files

| File | Role |
|---|---|
| `index.html` | the page (shell + CSS) |
| `app.js` | the UI (both tabs) |
| `layout.js` | layout model, checks, Python + JSON export — no DOM, shared with the test |
| `render.js` | the pixel-true renderer: a JS port of noknok.py's `Bitmap` + `NoknokDisplay` drawing path and the firmware's glyph painter |
| `data.gen.js` | **generated** — both fonts, the built-in icons and the colour table, extracted from noknok.py + `font8x8.h` |
| `data.gen.mjs` | the generator: `node data.gen.mjs` (re-run when noknok.py's icons/colours/font change) |
| `test/golden.mjs` | golden test: `node test/golden.mjs` (see below) |
| `test/golden_sim.py` | helper: runs a generated snippet through the real noknok.py on `display_sim.py` |

No build step and no dependencies: plain scripts, works from `file://` too.

## Keeping it truthful — the golden test

`test/golden.mjs` renders four fixture layouts (native + Pico text, umlauts, wrapping, all
alignments, own icons, embedded and `.bmp` images, landscape, edge clipping, custom panel)
with `render.js`, exports them with `layout.js`, runs the exported Python through the **real
`noknok.py`** on `brain-Pico/tools/display_sim.py`, and diffs the two frames pixel by pixel.
Run it after any change to `render.js`/`layout.js`, and after a noknok.py release:

```
node data.gen.mjs        # refresh fonts / icons / colours from noknok.py + font8x8.h
node test/golden.mjs     # needs Node, a desktop Python (PYTHON env var; default = Thonny's),
                         # and brain-Pico + module-I2C-1.42-display cloned next to Ecosystem
```

## Deploying

Copy `index.html`, `app.js`, `layout.js`, `render.js`, `data.gen.js` to
`buildwithnoknok.github.io/display-planner/` and commit — GitHub Pages serves it. The how-to
page is `display-planner-guide.md` in that repo.

## License

Code: MIT (SPDX headers in every file). It lives inside the CC BY-SA Ecosystem repo; the tool
itself is MIT like noknok.py so makers can embed or fork it freely.
