# Housing Configurator — V2 (frozen snapshot)

Frozen **V2** of the noknok housing configurator — the best-validated two-cover
buzzer template so far. Print-tested on the Bambu X1C in PLA.

What V2 adds over [V1](../V1/README.md):

- **Flexing cantilever cover latches** on the W/E walls (a thin arm springs a round
  detent into a wall window) instead of V1's stiff interference-fit snap — absorbs
  printer/material variation.
- **N/S latch built into the PCB-hold ribs**: each rib carries a round detent that
  clicks into a window in the N/S wall, so the bottom cover is tied to the top on
  **all four sides**. The ribs sit at the bay centre (flip-symmetric), so this side
  needs no flip trick.
- **No PCB retention nibs** — the closed walls hold the board; nothing grips it on
  disassembly.
- **`fit` control** — offsets every clearance at once to match your printer + material.
- **Assembled-preview toggle** — shows the covers mated (the STL still prints flat).

- **Run it:** open `index.html` — self-contained (`app.js` is the prebuilt bundle,
  three.js + JSCAD inside; no build or internet needed).
- `main.js` is the V2 source.

The **live** configurator (V3 onward) is in the **parent folder**. V2 is also the git
tag `housing-configurator-v2`.

Known open item carried into V3: cable management — the 6 cm I2C cables have a lot of
excess length that can get pinched between the descending top-cover wall and the base.
