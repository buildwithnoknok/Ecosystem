# Product Manifest — Structure Reference

A **product manifest** is one JSON file that tells the noknok app and the brain
everything needed to turn a pile of modules into a working product: which
modules it needs, which firmware they must be new enough to run, which script to
install, and how to guide the customer through setup.

It is an **open spec** — anyone can publish a product by publishing a manifest.

- Machine-checkable version: [`product-manifest.schema.json`](product-manifest.schema.json)
- How to build a product start to finish: [`authoring-products.md`](authoring-products.md)
- This file: what every field means and why.

Manifests live in the public [`poc`](https://github.com/buildwithnoknok/poc) repo
under `manifests/`, and are listed in `catalog.json`, which the app fetches first.

---

## Full example

```json
{
  "id": "smart-lamp-v1",
  "name": "Smart Lamp",
  "version": "1.0.0",
  "author": "buildwithnoknok",
  "brain_type": "pico_w",
  "price": 0.0,
  "setup_pattern": "Setup 3 (USB-C + I2C)",
  "description": "A configurable lamp: a USB LEDs module for light, a button to switch it on/off, one knob for brightness and one for colour, and a buzzer for confirmation sounds.",

  "modules_required": [
    { "type": "usb_leds",   "count": 1 },
    { "type": "led_button", "count": 1 },
    { "type": "knob",       "count": 2 },
    { "type": "buzzer",     "count": 1 }
  ],

  "module_firmware": {
    "usb_leds":   { "min": "1.8.1" },
    "led_button": { "min": "2.1.0" },
    "knob":       { "min": "2.1.0" },
    "buzzer":     { "min": "3.3.1" }
  },

  "files": [
    {
      "dest": "product.py",
      "url": "https://raw.githubusercontent.com/buildwithnoknok/poc/main/scripts/smart_lamp.py",
      "version": "1.0.0",
      "required": true
    }
  ],

  "3d_files": [],
  "assembly_guide": [
    "Connect the USB LEDs module to the DataHub, and the DataHub to the PicoHub.",
    "Connect the LED Button, both Knobs and the Buzzer to the PicoHub I2C ports.",
    "Plug the Pico into power.",
    "Run setup in the noknok app — you'll be asked which button and which knob does what."
  ],

  "roles": [
    { "id": "power_button",    "module_type": "led_button", "prompt": "Press the button you want to use to switch the lamp on and off" },
    { "id": "brightness_knob", "module_type": "knob",       "prompt": "Turn the knob you want to use for brightness" },
    { "id": "color_knob",      "module_type": "knob",       "prompt": "Turn the knob you want to use for colour" }
  ],

  "config_schema": []
}
```

---

## Identity

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Kebab-case, ending `-v<major>`, e.g. `smart-lamp-v1`. Must match the `id` in `catalog.json`. Bump the `-v<n>` suffix only for a breaking redesign — it is a different product, not a new version. |
| `name` | yes | Human-facing name shown in the app. |
| `version` | yes | Semver of the **product** (manifest + script together). Bump on any change to either. |
| `author` | yes | `buildwithnoknok` for first-party; a maker handle for community products. |
| `price` | no | In the app's currency. `0.0` for free. |
| `description` | yes | One-paragraph plain-language pitch for the app's listing. |

## Hardware shape

| Field | Required | Notes |
| --- | --- | --- |
| `brain_type` | yes | `pico_w` (standard) or `pico`. |
| `setup_pattern` | yes | Controlled vocabulary describing bus topology, **not** free text. I2C-only products are `"Setup 1 (I2C only)"`; anything using a USB module is a Setup 2/2b/3 variant. See the schema `enum`. |
| `modules_required` | yes | `[{ type, count }]` — what the customer must own. The app checks these against what enumerates on the brain. Identical modules are fine; enumeration gives each a unique address. |

`type` comes from a controlled vocabulary shared with `module_firmware` and
`roles`: `buzzer`, `knob`, `led_button`, `usb_leds`, `usb_datahub`,
`usb_powerhub`, `usb_picohub`, `display`. It must match what the Conductor
exposes (`c.buzzer`, `c.knob`, `c.ledbutton`, `c.leds`, `c.display`).

## `module_firmware` — a floor, not a pin

```json
"module_firmware": { "buzzer": { "min": "3.3.1" } }
```

**This is the field people get wrong, so it is worth being precise.** A manifest
does **not** say which firmware version to install, and does **not** carry a
`.bin` URL. It states the *oldest* firmware the product works against. What
actually gets installed is whatever that module's repo currently publishes.

| Key | Required | Notes |
| --- | --- | --- |
| `min` | yes | Oldest firmware version this product works against, semver. |

Why it works this way:

- **Module firmware is backwards compatible**, so a product written against
  buzzer 3.3.1 runs fine on 3.5.0. Pinning an exact version would mean editing
  every manifest each time any firmware is fixed, and would hold the fleet back
  on old firmware for no reason.
- **The old design was actively unsafe.** It pinned a version *and* a URL — the
  version in the `poc` repo, the bytes in the module repo, with the URL pointing
  at `main`. So the URL always served the newest binary while the manifest still
  named an old version, and the two drifted apart silently.

`min` should therefore change **rarely** — only when the product starts relying
on a firmware feature that did not exist before. Provisioning refuses to install
if the module's published firmware is somehow *older* than `min`, which means
someone published a product against firmware that never shipped.

Where "current" comes from: the brain reads
[`modules.json`](modules.json) to find the module's repo, then that repo's
`firmware/index.json`. Full mechanism, including the flash-`layout` safety
gate, is in [`firmware-index.md`](firmware-index.md).

## `files` — what gets installed on the brain

| Key | Required | Notes |
| --- | --- | --- |
| `dest` | yes | Filename on CIRCUITPY. At minimum one entry with `product.py`. |
| `url` | yes | Raw GitHub URL to the source (usually `poc/scripts/`). Must be pushed to `main` — unpushed means uninstallable. |
| `version` | yes | Version of this file. |
| `required` | yes | If `true`, provisioning fails when the file can't be fetched. |

## `roles` — telling identical modules apart

```json
"roles": [
  { "id": "brightness_knob", "module_type": "knob", "prompt": "Turn the knob you want to use for brightness" }
]
```

| Key | Required | Notes |
| --- | --- | --- |
| `id` | yes | Used in `product.py` as `c.role["<id>"]`. |
| `module_type` | yes | From the module-type vocabulary. |
| `prompt` | yes | Shown to the customer. Input modules ask for an interaction (press / turn); output modules use cue-and-confirm. |

**Leave `roles` as `[]`** unless the product needs to tell *identical* modules
apart by physical position. Whack-a-Mole has ten LED Buttons and no roles — every
button is interchangeable, so it iterates `c.ledbutton` instead. Smart Lamp has
two knobs that do different jobs, so it needs roles. See [`roles.md`](roles.md).

## Presentation and extras

| Field | Required | Notes |
| --- | --- | --- |
| `assembly_guide` | no | Ordered plain-language steps shown in the app. |
| `3d_files` | no | Printable housing files, added when the physical product is designed. |
| `config_schema` | no | Customer-configurable settings (v2, DEV-34) — rendered by the app, read by `product.py` via `c.settings`. See below. |

### `config_schema` v2 — the manifest carries the schema, the device carries the values

Since brain-Pico `code.py` 0.17 / `noknok.py` 1.8 (Sep 2026) this is real: the app
renders a settings page from the list, reads and writes the values over the device
protocol (`settings.get` / `settings.set`, see `brain-Pico/docs/provisioning-http-api.md`),
and `product.py` reads them with `c.settings.get(id)`. A knob turn and the app change
the same value; the device is the source of truth, last write wins.

```json
"config_schema": [
  { "id": "on",          "type": "toggle", "label": "Lamp on",     "default": true },
  { "id": "brightness",  "type": "slider", "label": "Brightness",  "min": 0, "max": 255, "step": 1, "default": 180 },
  { "id": "color",       "type": "color",  "label": "Lamp colour", "default": "#FFAF5F" },
  { "id": "mode",        "type": "select", "label": "Mode",        "options": [{"value": "solid", "label": "Solid"}, {"value": "breathe", "label": "Breathe"}], "default": "solid" },
  { "id": "name",        "type": "text",   "label": "Name",        "max_length": 24, "default": "" },
  { "id": "sundown_at",  "type": "time",   "label": "Sundown at",  "default": "21:00" }
]
```

| type | value | extra keys |
| --- | --- | --- |
| `toggle` | `true` / `false` | — |
| `slider` | number in `[min, max]` | `min`, `max` (required), `step`, `unit` |
| `color` | `"#RRGGBB"` | — |
| `select` | one of `options[].value` | `options: [{value, label}]` (required) |
| `text` | string | `max_length` |
| `time` | `"HH:MM"` local time | — |

Rules: `default` is **required** for every entry (the app sends all defaults to the
brain at install as `config_defaults`, so device and app agree from first boot);
`id` is lowercase snake_case; optional `group` sections the page, `help` adds a hint.
The **app validates** input against the schema; the **brain stores values verbatim**
and `product.py` clamps (never trust a value blindly). The brain never needs the
schema — the app finds the product id in the device's settings record and fetches
the manifest from the catalog.

Lifetimes: same product reinstalled → values **kept** (new entries get defaults,
removed ones are dropped); different product → **replaced** by its defaults;
`settings.reset` → defaults; factory reset → everything wiped. Values live in the
brain's runtime Store (nvm / FRAM) — never in a file (DEV-18) — written only when
changed and only after 5 s without further changes.

`time` caveat: the brain has no battery clock. Online products get the time via NTP;
offline products only while the app is connected (`clock.set`, DEV-36). The app shows
that hint automatically for any product that declares a `time` setting.

---

## Validating a manifest

```bash
python3 -c "import json,jsonschema; jsonschema.validate(json.load(open('manifests/smart-lamp.json')), json.load(open('product-manifest.schema.json'))); print('PASS')"
```

## Publish checklist

1. Script in `poc/scripts/`, manifest in `poc/manifests/`.
2. Manifest validates against the schema.
3. `files[].url` point at raw `main` URLs; `module_firmware` declares a `min` per module type.
4. Added to `catalog.json` (+ bump `catalog_version` and `updated`).
5. `git push` — the app fetches from `main`, so unpushed means uninstallable.
6. Bench-test on real hardware: enumerate, run, verify behaviour.

## Related

- [`authoring-products.md`](authoring-products.md) — the full how-to
- [`product-manifest.schema.json`](product-manifest.schema.json) — machine-checkable spec
- [`firmware-index.md`](firmware-index.md) — how firmware is resolved and installed
- [`roles.md`](roles.md) — role assignment in depth
