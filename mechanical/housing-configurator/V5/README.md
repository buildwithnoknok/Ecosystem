# Housing Configurator — V5 (frozen snapshot)

Frozen **V5** — the **monolithic uniform box**. This is the first version published
for customers (live at <https://buildwithnoknok.github.io/configurator/>, with a how-to
guide at <https://buildwithnoknok.github.io/housing-configurator/>).

Modules are placed freely on a 2D bird's-eye **10 mm grid**, then the tool generates a
single box (front + back cover, one uniform height):

- `main.js` — 2D placement + user-drawn box outline → one box with per-module M2.5
  **holding columns** (front post + back post + locating peg through the PCB hole), payload
  openings in the front plate, USB-C **power slots** and cover **latches** on user-picked walls.
- Column lengths adjust per module so every payload reaches the front plate while the outer
  box stays one uniform height (no staircase).
- Modules: buzzer / knob / LED button (20×20), USB LEDs (40×40), display (40×30).

**Flow:** add modules → drag/rotate to arrange → click empty cells to shape the box →
click a wall for a power slot → switch to latch and click walls for latches → Generate 3D box
→ Download STL (print layout is auto-tiled: front plate down, back mirrored across the fold).

- **Run it:** open `index.html` (self-contained `app.js`). Also `git tag housing-configurator-v5`.
