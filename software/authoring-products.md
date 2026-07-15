<!--
SPDX-FileCopyrightText: 2026 noknok (Christopher Houben)
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Authoring a noknok Product

**Read this first if you (human or LLM) want to build a new noknok product.**

A noknok "product" is not firmware and not an app build. It is **two files** the
noknok app installs onto a Pico brain:

1. a **manifest** (`poc/manifests/<product>.json`) — declares the modules, firmware and files the product needs, and
2. a **product script** (`poc/scripts/<product>.py`) — the game/behaviour, installed on the brain as `product.py`.

Everything else already exists: the modules, their firmware, the `noknok`
CircuitPython library, and the enumeration that finds modules and gives each a
unique address. **You almost never write firmware to make a new product** — you
compose existing modules.

This guide is intentionally thin. It is a **map plus the glue that isn't
documented elsewhere**. For the deep detail it points you at the canonical docs
rather than duplicating them (duplication drifts out of date).

---

## The 4 things you touch

| # | File | What it is |
|---|------|-----------|
| 1 | `poc/scripts/<product>.py` | The product logic. Runs on the Pico as `product.py`. |
| 2 | `poc/manifests/<product>.json` | The manifest. Validate it against [`product-manifest.schema.json`](product-manifest.schema.json). |
| 3 | `poc/manifests/catalog.json` | Add one `{ id, manifest-url }` line so the app lists the product. Bump `catalog_version` + `updated`. |
| 4 | *(optional)* housing files + `README` | 3D housing (Theo) and docs, added when the physical product is designed. |

Both files live in the **public `poc` repo**. The manifest's `files[].url` and
`module_firmware[].url` are **raw GitHub URLs** the app fetches at provision
time, so your script must be pushed to `main` for the product to install.

---

## The manifest

Full field reference + validation: **[`product-manifest.schema.json`](product-manifest.schema.json)**.
The parts that trip people up:

- **`setup_pattern`** is a *controlled vocabulary*, not free text. I2C-only
  products (buttons/knobs/buzzer/display) are `"Setup 1 (I2C only)"`. Anything
  using a USB module is a Setup 2/2b/3 variant. See the schema `enum`.
- **`modules_required[].type`** and the **`module_firmware`** keys are a
  *controlled vocabulary* too (`buzzer`, `knob`, `led_button`, `usb_leds`, …) —
  they must match what the Conductor exposes. See the schema `moduleType` enum.
- **`module_firmware`** pins a version + `.bin` URL **per module type**. These
  are hand-copied from each module repo's `firmware/bin/`. There is no single
  source, so when a module's firmware is bumped, every manifest using it must be
  updated. Copy the current values from a recent manifest (e.g.
  `two-button-box.json`) unless you have a reason to pin older firmware.
- **`roles`** — leave it **`[]`** unless the product needs to tell *identical*
  modules apart by their physical position. See "Modules: lists vs roles" below.
- **`config_schema`** — you may declare it, but **it is not yet plumbed to
  `product.py`** (as of 2026-07). Do not depend on it for runtime values; use a
  physical control or a self-managed state file instead (see Gotchas).

---

## The product.py lifecycle contract

Every product script follows the same shape. This isn't enforced by code — it's
the convention all products share, learned from the existing scripts. Copy it.

```python
from noknok import Conductor
import time

c = Conductor()
c.enumerate()          # discovers modules on the I2C bus, assigns addresses (~3 s)
# c.enumerate_all()    # use this instead if the product also has USB modules
c.load_roles()         # ONLY if the manifest declares roles; loads noknok_roles.json

# 1. Grab the modules you need and VALIDATE they're present.
#    By type-list (symmetric use):   c.buzzer[0], c.knob[0], c.ledbutton (whole list)
#    By role (stable per-module):    c.role["power_button"]
if not c.buzzer:
    raise SystemExit("No buzzer found — check wiring.")

# 2. Signal "ready" so the customer knows setup finished.
c.buzzer[0].tune(c.buzzer[0].STARTUP)

# 3. Main loop: poll modules, react, repeat.
while True:
    c.check_factory_reset(c.knob[0].read())   # hold the knob 5 s → factory reset
    # ... product behaviour ...
    time.sleep(0.03)
```

Key facts about this contract:

- **The product runs entirely on the Pico**, in real time. There is no
  round-trip to the app during play. Good for games and instruments.
- **`enumerate()` populates per-type lists** in discovery order: `c.buzzer`,
  `c.knob`, `c.ledbutton`, `c.leds` (USB). Empty list = none found.
- **Always include a factory-reset escape hatch** (`c.check_factory_reset(...)`)
  if a knob is present — it's how a customer un-bricks a product.
- **Reads can return `None`** on an I2C hiccup — guard every `.read()`.

Module APIs (methods, status objects) live as docstrings in
**[`brain-Pico/software/noknok.py`](https://github.com/buildwithnoknok/brain-Pico/tree/main/software)**.
That file is the API reference — read the class for the module you're using
(`NoknokBuzzer`, `NoknokKnob`, `NoknokLedButton`, …).

---

## Modules: lists vs roles

There are two ways to talk to modules, and picking the right one is the single
most important design decision in a product:

- **Type list — `c.ledbutton[i]`** — when modules of a type are
  **interchangeable**. Whack-a-Mole lights a *random* button; it doesn't matter
  which physical button is which. Use the list, set `roles: []`, and setup is
  just "plug in and play." This is the simplest product to build.
- **Roles — `c.role["ok_button"]`** — when a specific physical module must do a
  specific job (an "OK" vs "Cancel" button, a "brightness" vs "colour" knob).
  The manifest declares each role with a prompt; the app asks the customer to
  press/turn/identify the right module; the binding is saved by UID so it's
  stable across reboots. Full process: **[roles.md](roles.md)**.

Rule of thumb: **default to lists.** Only add roles when the product genuinely
needs to distinguish otherwise-identical modules.

---

## How "10 identical modules" works (no magic)

You can require 10 identical LED Buttons — or any count up to ~20 total modules
— and each one is still individually addressable. At power-on every module boots
with I2C off and joins the bus one at a time using a UID-derived backoff timer;
the Conductor assigns each a unique runtime address. You get `c.ledbutton` as a
list of 10 working modules with **no manual addressing and no new firmware**.
Full mechanism: **[enumeration.md](enumeration.md)**.

---

## Gotchas (hard-won — read before you design)

- **`config_schema` is declared but not delivered.** Provisioning does not yet
  push config values to `product.py`. For runtime input, use a **physical
  control** (e.g. a knob to pick difficulty) or have the script read/write its
  **own** state file on CIRCUITPY. Don't design a product that can't work
  without app config until this is plumbed.
- **Power budget is real.** Each lit RGB LED (SK6812) can pull ~50–60 mA. Ten
  buttons at full brightness ≈ 0.5–0.6 A — more than the Pico's 3V3 regulator
  should source. High-count-LED products must be powered from the 5 V rail via a
  **PowerHub**, not bus-powered from a laptop. Flag power to Sam early.
- **One I2C bus, many ports.** All I2C modules share a single bus; a PicoHub has
  a limited number of physical ports, so high module counts need Qwiic
  branches / a hub to fan out. Electrically fine (that's what enumeration is
  for) — but it needs a wiring plan.
- **Firmware URLs drift.** `module_firmware` versions are copied by hand into
  each manifest. When a module's firmware is bumped, existing manifests keep
  pointing at the old version until updated.
- **Not every module has a library driver yet.** The 1.42" display is a real
  module but its driver isn't in `noknok.py` yet — a product can't use it until
  that lands. Check `noknok.py` for a `Noknok<Module>` class before you rely on
  a module.
- **File header.** Start scripts with the SPDX header
  (`# SPDX-License-Identifier: MIT`) followed by a `# <filename> — <title>`
  comment block. (Some older scripts predate this — match the newer ones.)

---

## Worked example: Whack-a-Mole

The cleanest reference for the **symmetric-modules** pattern:

- Manifest: [`poc/manifests/whack-a-mole.json`](https://github.com/buildwithnoknok/poc/blob/main/manifests/whack-a-mole.json)
  — 10× `led_button` + `buzzer` + `knob`, `roles: []`, `config_schema: []`.
- Script: [`poc/scripts/whack_a_mole.py`](https://github.com/buildwithnoknok/poc/blob/main/scripts/whack_a_mole.py)
  — uses the whole `c.ledbutton` list, picks moles at random, difficulty chosen
  on the knob at runtime (not app config), screen-free score via buzzer + LEDs.

For a **role-based** product instead, read
[`poc/scripts/two_button_box.py`](https://github.com/buildwithnoknok/poc/blob/main/scripts/two_button_box.py).

---

## Publish checklist

1. Script in `poc/scripts/`, manifest in `poc/manifests/`.
2. Manifest validates against `product-manifest.schema.json`.
3. Manifest `files[].url` / `module_firmware[].url` point at raw `main` URLs.
4. Added to `catalog.json` (new product line + bump `catalog_version` + `updated`).
5. `git push` — the app fetches from `main`, so unpushed = uninstallable.
6. Bench-test on real hardware: enumerate, run, verify behaviour.

---

## For LLMs / the AI Product Builder

This guide + the manifest schema are designed to be the knowledge base for
generating products — by hand today, and for the app's AI Product Builder
(Jira DEV-14). To build a product from a prompt you need exactly four inputs,
all linked above: **(1)** this contract, **(2)** the manifest schema, **(3)** the
module APIs in `noknok.py`, and **(4)** the constraints in Gotchas. Firmware is
out of scope — products compose existing modules only.
