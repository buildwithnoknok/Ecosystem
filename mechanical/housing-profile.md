# noknok Housing Profile — Open Spec (`housing.json`)

The **housing profile** is a small, machine-readable description of everything a
3D-printed housing needs to know about a module: its footprint, mounting holes,
connector positions, and what the lid must provide on the top face (a hole, a
window, a grille, …).

Each module repo carries its own profile at **`mechanical/housing.json`**.
The noknok housing configurator reads these profiles, drops each module into a
grid bay, merges the bays into one snap-fit shell, routes cable channels between
connectors, and cuts the top features into the lid. Add a new module → add one
`housing.json` → it appears in the configurator. No configurator code changes.

This document is the authoritative spec for the file format.

---

## 1. Units & coordinate system

- **All dimensions are millimetres (mm).** Never centimetres, never inches.
- **Origin = bottom-left corner of the PCB**, looking at the module from the
  **top** (component/interaction side).
- **X → right, Y → up.** So a 20 × 20 mm board spans X `0…20`, Y `0…20`.
- The UI snap grid (default 10 mm) is a *placement convenience only* and is
  independent of these real dimensions — a module's geometry never changes if
  the grid resolution changes.

---

## 2. Field reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schema` | string | ✔ | Spec version. Currently `"noknok-housing/1"`. |
| `module` | string | ✔ | Official module name, lowercase-kebab (e.g. `noknok-buzzer`). |
| `repo` | string | ✔ | GitHub repo name the module lives in. |
| `bus` | string | ✔ | `"I2C"` or `"USB"`. Drives which cable-channel type is routed. |
| `footprint` | object | ✔ | `{ "w": <mm>, "h": <mm> }`. Must be whole-cm per the PCB guideline. |
| `pcb_thickness` | number | ✔ | Board thickness in mm (standard noknok board = `1.6`). |
| `clearance_top` | number \| null | ✔ | Height of the tallest component **above** the PCB → pocket/lid depth. `null` = not yet measured. |
| `clearance_bottom` | number \| null | ✔ | Height of anything **below** the PCB (bottom connectors, etc.) → standoff height. `null` = not yet measured. |
| `mounting` | object | ✔ | `{ "screw": "M2.5", "holes": [ … ] }`. See §3. |
| `connectors` | array | ✔ | Connector list for cable routing. See §4. |
| `top_feature` | object \| null | ✔ | What the lid must provide over this module. `null` = blank lid. See §5. |
| `notes` | string | – | Free text: measurement caveats, estimates, TODOs. |

---

## 3. `mounting`

```jsonc
"mounting": {
  "screw": "M2.5",                 // ecosystem-wide fastener
  "holes": [
    { "x": 2.25, "y": 2.25,  "dia": 2.5 },
    { "x": 17.75, "y": 17.75, "dia": 2.5 }
  ]
}
```

Hole centres are `(x, y)` from the origin, `dia` = drill diameter (Ø2.5 mm NPTH,
per the PCB mechanical guideline). Two diagonal holes on 20 × 20 modules; four on
40 × 40. These feed the housing's standoff/boss positions.

---

## 4. `connectors`

```jsonc
"connectors": [
  { "type": "JST-SH-I2C", "edge": "W", "x": 3.1,  "y": 4.5,  "role": "chain" },
  { "type": "JST-SH-I2C", "edge": "E", "x": 16.9, "y": 15.5, "role": "chain" }
]
```

| Key | Values | Meaning |
|-----|--------|---------|
| `type` | `JST-SH-I2C`, `USB-C` | Connector kind → sets channel width. |
| `edge` | `N`, `E`, `S`, `W` | Which board edge the connector faces. **This is the load-bearing field for routing** — exact `x`/`y` is secondary. |
| `x`, `y` | mm | Connector centre from origin. |
| `role` | `chain`, `external`, `power` | `chain` = routed to a neighbour bay; `external` = must reach the housing outer wall (USB-C ports, power in). |

---

## 5. `top_feature`

What the housing lid must open up over the module so the user can interact with it.

```jsonc
"top_feature": {
  "type": "round_hole",       // see enum below
  "shape": "circle",          // "circle" | "rect"
  "x": 10, "y": 10,           // feature centre, mm from origin
  "dia": 7,                   // for shape "circle"
  "w": 0, "h": 0,             // for shape "rect"
  "depth": "through",         // "through" | <mm recess depth>
  "verified": false           // true once physically confirmed
}
```

`type` enum:

| `type` | Used by | What the lid gets |
|--------|---------|-------------------|
| `none` | closed modules | nothing (solid lid) |
| `round_hole` | knob | round shaft hole |
| `window` | display | rectangular window / recess |
| `button` | LED Button | press opening (or thin flex membrane) |
| `light_window` | LEDs | light-transmissive window / diffuser slot |
| `grille` | buzzer | pattern of sound holes |
| `port` | USB hubs, PowerHub | edge cut-out for external ports |

---

## 6. Versioning

The `schema` string is bumped (`noknok-housing/2`, …) on any breaking change.
The configurator reads `schema` and refuses profiles it doesn't understand.

## 7. Licensing

Housing profiles are mechanical design data → **CC BY-SA 4.0**, same as the rest
of the hardware in each module repo (`LICENSE-hardware`). No separate header is
carried inside the JSON so the files stay strictly valid JSON.

---

## 8. Minimal example (buzzer, 20 × 20 I2C)

```json
{
  "schema": "noknok-housing/1",
  "module": "noknok-buzzer",
  "repo": "module-I2C-buzzer",
  "bus": "I2C",
  "footprint": { "w": 20, "h": 20 },
  "pcb_thickness": 1.6,
  "clearance_top": null,
  "clearance_bottom": null,
  "mounting": {
    "screw": "M2.5",
    "holes": [
      { "x": 2.25,  "y": 2.25,  "dia": 2.5 },
      { "x": 17.75, "y": 17.75, "dia": 2.5 }
    ]
  },
  "connectors": [
    { "type": "JST-SH-I2C", "edge": "W", "x": 3.1,  "y": 4.5,  "role": "chain" },
    { "type": "JST-SH-I2C", "edge": "E", "x": 16.9, "y": 15.5, "role": "chain" }
  ],
  "top_feature": {
    "type": "grille", "shape": "circle", "x": 10, "y": 10, "dia": 12,
    "depth": "through", "verified": false
  },
  "notes": "clearance_top/bottom pending physical measurement; connector x/y and top_feature position transcribed from the Ecosystem PCB guideline — regenerate exact values from KiCad before production."
}
```
