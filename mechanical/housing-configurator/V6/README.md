# Housing Configurator — V6 (frozen snapshot)

Frozen **V6** — the **print-validated** monolithic box, published for customers
(<https://buildwithnoknok.github.io/configurator/>). Same architecture as V5 (2D placement → one
uniform front + back cover); this snapshot rolls up several physical-print rounds plus two features.
See the parent [`README.md`](../README.md) for the full current description.

**Print-validation fixes (from Christopher's V5/V6 prints):**

1. **Short locating pegs** — 1.6 mm (= PCB thickness), centred; pull out cleanly on disassembly.
2. **Stronger cover latch** — shorter arm + hulled tapered "pyramid" base (wall face stays vertical).
3. **USB power = open U-slot** at the parting line (lay the cable in; no threading a plug through).
4. **LED button** recessed **5.0 mm** (keyboard-switch PCB-to-cover), retained by a collar (below).
5. **JST arrows** in the 2D view: tail = socket, points the plug-in direction (⟂ to the socket edge).
6. **4-corner support** — columns under the JST sockets; a **SEAT** (1.2 mm) lift keeps even the
   tallest module's columns printable.
7. **USB-LEDs** square front window **38 × 38 mm** (round clipped the corner LEDs).
8. **Collar retention** (`recessCollar`/`holeInOpening`) — where a mount hole sits under the payload
   opening, skip the blocking front post and retain the recessed board with a well-wall around the opening.
9. **2 mm module-to-wall clearance** (WALL_GAP) for easy assembly.

**Features:**

- **Text labels** engraved 0.4 mm into the top cover (built-in single-stroke font), along a chosen
  module edge; the labelled tiles are reserved (no module under the text).
- **No overlapping modules** (add finds a free spot; drag/rotate are collision-blocked).
- **Separate exports** — Download STL (both covers) + top-cover / bottom-cover buttons.

- **Run it:** open `index.html` (self-contained `app.js`). Tag: `git tag housing-configurator-v6`.
