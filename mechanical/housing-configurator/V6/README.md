# Housing Configurator — V6 (frozen snapshot)

Frozen **V6** — the **print-validated** monolithic box. Same architecture as V5 (2D placement →
one uniform front + back cover), with seven fixes from Christopher's first physical V5 print:

1. **Shorter locating pegs** — pegs are now `pegLen` (1.6 mm, = PCB thickness), centred in the
   board. They locate the PCB without reaching into the opposite post, so they pull out on
   disassembly instead of snapping off. The old back-post peg socket is gone.
2. **Stronger cover latch** — the cantilever is shorter (lower detent) and its base is a hulled
   **tapered buttress** (flares toward the interior; wall-side face stays vertical so the detent is
   unchanged). Stops the arm shearing off at the root while the thin tip still flexes.
3. **USB power = open U-slot** — instead of an enclosed hole you must thread a plug through, the wall
   now has a 5 mm-wide U-notch open at the parting line with a rounded top. The plug is fitted to the
   module first; the bare cable drops into the slot before the covers close.
4. **LED button recessed 6.6 mm** — `clearance_top` 0 → 6.6, so the button sits properly inside the
   housing behind the front window (and now gets front + back holding posts like the others).
5. **JST arrows** — the 2D view draws an **arrow** at each connector instead of a black box: the tail
   marks the socket, the arrow points the way the plug is inserted, so you can plan cable routing.
6. **4-corner support** — the two corners without an M2.5 hole now get support columns that rise to
   just under the JST-SH socket body (`SOCKET_H` = 2.95 mm), bracing the board at all four corners.
7. **Square USB-LED window** — the round front opening (which clipped the corner LEDs) is now a
   36 × 36 mm square.

Published live: <https://buildwithnoknok.github.io/configurator/> (how-to:
<https://buildwithnoknok.github.io/housing-configurator/>).

- **Run it:** open `index.html` (self-contained `app.js`). Tag: `git tag housing-configurator-v6`.
