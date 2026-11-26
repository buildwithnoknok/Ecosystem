<!--
SPDX-FileCopyrightText: 2026 noknok (Christopher Houben)
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Lamp shades for the noknok LEDs 16x (ready-made STLs)

Three decorative shades that twist onto the **same ø44 bayonet** as the reference dome lid. They are
new lid styles in the Housing Configurator (`Ecosystem/mechanical/housing-configurator/main.js`, branch
merged in PR 2). Each one reuses `domeGeo()` and `domeLidCuts()`, so
tube, lug slots, ramp and click dimple are identical to the plain lid. They show up as download buttons
whenever a design contains the 16x +dome module.

| Shade | Parts to print | Height above cover | Filament |
| --- | --- | --- | --- |
| Mushroom | stem + cap (cap slips over the stem's spigot), plus optional diffuser (`noknok_shade_mushroom_diffuser_44.stl`, 56 mm, thin white, sits inside the stem) | about 115 mm | stem white, cap red or any colour |
| Flutes | lid, plus optional tall diffuser | about 112 mm (lid is 118 from the tube end) | white or translucent |
| Facet globe | one lid, plus optional diffuser (`noknok_shade_facet_diffuser_44.stl`, 91 mm, thin white) | about 118 mm | white or translucent |

Files: `noknok_shade_mushroom_stem_44.stl`, `noknok_shade_mushroom_cap_44.stl`, `noknok_shade_flutes_44_lid.stl`,
`noknok_shade_flutes_44_diffuser.stl`, `noknok_shade_facet_44.stl`. Print pose = the STL pose, no supports.

## How each one is made (and what is different from the inspiration pictures)

- **Mushroom**: bulb stem with tall diamond slits, cap with a diamond lattice. Original choices: no spots,
  slit stem against a diamond cap, 4-spoke sleeve with 6 crush ribs for the fit. The cap prints brim down: the
  spokes, sleeve and rim lie on the bed, the dome grows up. Its top is a 38 degree cone (52 degrees from vertical),
  not a round dome, which is the one place it leans past the 47 degree rule: watch the first print.
- **Flutes**: 28 sine flutes on a 49 mm tube, twist reversing every 13.9 mm so the folds zigzag. Smooth
  flutes and a 22 degree twist (not sharp pleats). The optional diffuser is the existing 16x diffuser (flange on the
  45 degree seat, three lug bays) with a straight tube and a 45 degree cone top, 100 mm tall, thin white.
- **Facet globe**: sphere band between plus/minus 45 degrees latitude joined by 45 degree cones (so the whole
  outside stays within 45 degrees from vertical), flat top d20. The tiles are tilted rhombic pockets in a
  3 mm wall, three tilts in a rhythm of 3. A different tile shape and rule from the cube-tiling globes.

## What is proven and what is not (by computer)
- Built headless with Node from the configurator's `main.js` (same as the other dome lids); STL volumes and bounding boxes
  sane; flute and diffuser overhang analysis clean; the bayonet cuts are the reference ones.
- JSCAD STLs are not strictly watertight (the unmodified reference lid reports the same), slicers repair it.
- NOT proven: any print. Click and fit on the real cover (diffuser flange, spigot crush fit 0.15 mm), the 52 degree cap top, the
  facet pocket depths (wall 3.0, deepest pocket 2.5) and light output are all untested.
- Build time in the browser is long for the lattice parts (minutes for the mushroom cap and the facet globe).

## Second batch (20 Nov 2026): rocket, moon and stars, police car, hero lamp, red egg

Same bayonet foot, same configurator buttons (one per part). Each is my own take on the reference picture, not a copy.

| Shade | Parts | Size | Notes |
| --- | --- | --- | --- |
| Kids rocket | `rocket_body` (3 fins, round-hole perforation) + `rocket_nose` (colour 2) | about 126 mm | Nose presses onto a thin spigot ring on the body (6 crush ribs). Fins have a 45 degree underside. |
| Moon and stars | `stars` | 110 mm | Wide tube (76 mm) after a 45 degree flare out of the bayonet, OPEN at the top, 1.6 mm wall. About 150 stars, six crescent moons and one shooting star cut through the wall. |
| Police car | `police_car` | 88 x 52 x 64 mm | Generic toy car, not a licensed model, rounded. Wheels and the body edge sit on the base level (the cover face), the underside is open, a thin 45 degree cone inside joins the bayonet to the body. **Prints upside down** (roof on the bed, the light bar is its foot, bayonet pointing up); the STL is already in that pose. Paint the light bar red and blue. |
| Hero lamp | `hero_head` + `hero_face` + `hero_body` | about 155 mm assembled | See "Hero lamp assembly" below. The 16x is the face. Blocky hero with a lightning bolt and belt, no cape. **The neck cradle assumes the 16x housing box is 54 mm wide and 54 mm tall (`HERO.boxW`). Measure the real box and change that number before printing the body.** |
| Red egg | `egg` | 106 mm | Organic Voronoi lattice (12 mm cells, 2.6 mm web), solid cap and skirt, one connected piece (loose slivers are removed in the build). Print in red. |

Not proven for any of these: any print, the nose and bayonet fit on a real cover, the hero cradle against the real box, and the light output.
The existing 16x diffuser (the globe one) fits inside the egg and the moon and stars lantern, but I did not test that.


## Hero lamp assembly (preview: `hero_assembled.png`, `hero_exploded.png`, `noknok_shade_hero_ASSEMBLED_preview_44.stl`)

1. Build the 16x housing box in the configurator as usual (one 16x +dome module, the bayonet face is the dome mount) and put the module in it.
2. Stand the box in the neck cradle of `hero_body` with the bayonet face pointing forward. The cradle has a floor, left, right and back wall and is open to the front and top. The lower 22 mm of the box sit inside it. The box is not modelled in the print files (gray in the pictures).
3. Twist `hero_head` (the red hood) onto the box's bayonet. It is a lid like all the others, axis pointing forward.
4. Drop `hero_face` (thin white plate, 1.2 mm) into the hood opening: it rests on a ledge and holds with 6 small crush bumps. It is the diffuser; print it flat, white.
Not proven: the cradle size and fit against the real box, and whether the head tips the box forward (add a dot of glue or tape in the cradle if it does).

The STL files in this folder are what the configurator's shade buttons produce (built 20 Nov 2026). The generator in `housing-configurator/main.js` is the source: regenerate rather than edit the STLs.
