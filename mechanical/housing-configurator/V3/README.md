# Housing Configurator — V3 (frozen snapshot)

Frozen **V3** — the two-cover template, **print-validated on the Bambu X1C** with a real
module inside (buzzer). Same core mechanics as [V2](../V2/README.md), plus:

- **Latch-vs-PCB fix:** the flexing latch arm's free tip is now capped just below the
  PCB (`pcbBotZ − 0.4`). Before this, the arm tip (z 6.3) fouled the board edge (z 6.2)
  and couldn't flex, so the detent jammed and the covers gapped **with a module in** —
  even though they snapped shut empty. Capping the tip lets the arm always flex.
- **Profile-driven module top covers:** a Module dropdown (buzzer / knob / LED button).
  `topFeatureCut()` generates the opening from the profile — **grille / round_hole /
  button / window**. Only the top opening and the payload height differ between them.
- The V3 cable-management experiment (tuck clips, wall relief, chain notches) was
  **reverted** — the clips blocked module insertion. Kept the plain V2 plenum.

- **Run it:** open `index.html` — self-contained (`app.js` is the prebuilt bundle,
  three.js + JSCAD inside; no build or internet needed).
- `main.js` is the V3 source. Also served at **http://Brain/** on the local network.

The **live** configurator (V4 onward) is in the **parent folder**. V3 is also the git
tag `housing-configurator-v3`.

Parked for now (need sample hardware to test the fit): the **1.42″ display** (40×30,
W/S connectors) and the **Pico/brain carrier** housing.
