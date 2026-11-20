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

Both files live in the **public `poc` repo**. The manifest's `files[].url` are
**raw GitHub URLs** the app fetches at provision time, so your script must be
pushed to `main` for the product to install.

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
- **`module_firmware`** declares a **floor**, not a pin: `{ "buzzer": { "min":
  "3.3.1" } }`. Module firmware is backwards compatible, so the brain installs
  whatever each module repo currently publishes (see
  [`firmware-index.md`](firmware-index.md)) and `min` only guards the case where
  a module is too old to run your product. Set it to the version you actually
  developed against and then leave it alone — you do **not** need to touch
  manifests when a module's firmware is bumped.
- **`roles`** — leave it **`[]`** unless the product needs to tell *identical*
  modules apart by their physical position. See "Modules: lists vs roles" below.
- **`config_schema`** — the settings the customer can change in the app. Since
  Sep 2026 (`c.settings`, DEV-34) these values reach `product.py` for real; see
  "Settings: `c.settings`" below and [`product-manifest.md`](product-manifest.md)
  for the six types. Every entry needs a `default`.

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
    # ... product behaviour ...
    time.sleep(0.03)
```

Key facts about this contract:

- **The product runs entirely on the Pico**, in real time. There is no
  round-trip to the app during play. Good for games and instruments.
- **`enumerate()` populates per-type lists** in discovery order: `c.buzzer`,
  `c.knob`, `c.ledbutton`, `c.display`, `c.leds` (USB LEDs, 8× RGB) and
  `c.leds16` (USB LEDs 16x, 16× RGBW — same calls plus an optional `w=` white
  value, `white(level)` and `status()` / `temperature()`). Empty list = none found.
- **Factory reset is the brain's job, not yours.** Every product shares one
  gesture: hold any LED Button or Knob button *while plugging in the power*,
  keep holding until the LED Buttons flash / the buzzer confirms (~8 s), and
  the brain wipes itself back to the setup AP. Your gestures are all yours —
  a single button can do short-press *and* long-press without reserving a
  hold for the reset. A product with nothing pressable is reset from the app.
  (`c.check_factory_reset(knob_status)` still exists if you want a runtime
  knob-hold as well.)
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

## Settings: `c.settings` (app-configurable values)

If your manifest declares a `config_schema`, the customer can change those values
from the app while the product runs, and a physical control can change the same
values. The Conductor gives you one object for it — no files, no endpoints:

```python
c = Conductor()
c.enumerate_all()

s = c.settings
s.defaults({"on": True, "brightness": 180, "color": "#FFAF5F"})   # same ids as config_schema

def apply(changed=None):            # paint the hardware from the current values
    lamp.set_brightness(s.get("brightness"))
    ...
s.on_change(apply)                  # the app changed something → called for you
apply()

while True:
    k = knob.read()
    if k.delta:                     # the knob changed something → tell the settings
        s.set("brightness", clamp(s.get("brightness") + k.delta * 5))
        apply()
    c.sleep(0.03)
```

- `defaults({...})` — declare once at start; fills in anything the app has not set
  yet. Use the **same ids** as your `config_schema`.
- `get(id, default=None)` / `set(id, value)` / `all()` — plain values; `set` from
  a knob is cheap, call it as often as you like.
- `on_change(callback)` — `callback(changed: dict)` runs when the app changed
  values. It is called **for you, between two of your module reads** (or inside
  `c.sleep()`), never in the middle of one — so it is safe to talk to modules in it.
- `c.sleep(seconds)` — use it instead of `time.sleep()` when your loop idles for
  long stretches. It keeps the app answered meanwhile. A loop that polls modules
  every few tens of ms needs nothing: every module read already services the app.
- Persistence is handled for you: values are written to the brain's runtime Store
  only when changed and only after 5 s without further changes (a knob turn is
  dozens of changes per second — never a flash write each). They survive power
  cycles and a reinstall of the same product; a different product starts from
  its own defaults.
- Clamp what you read. The app validates against the schema, the brain stores
  verbatim; your product is the last line of defence.
- **Read-only values for the app (`info`):** to show something the customer can
  see but not change (a module temperature, a counter, a status line), declare a
  `config_schema` entry with `"type": "info"` (no `default`) and hand the brain a
  function that returns the current value:

  ```python
  leds = c.leds16[0]
  s.info("temperature", leds.temperature)            # -> 42.6, shown as "42.6 °C"
  s.info("light", lambda: "Dimmed (warm)" if leds.status()["limited"] else "Normal")
  ```

  The function runs each time the app asks (every ~3 s while the page is open),
  never in your loop, and its result is never stored. Keep it to one quick module
  read. If it raises, the app shows `—` instead of breaking. The app cannot change
  an `info` value, and `s.set()` on it is refused.
- The whole thing is optional: a product with no `config_schema` never touches
  `c.settings` and pays nothing.

## Gotchas (hard-won — read before you design)

- **Settings come from `c.settings`, never from a file you manage yourself.**
  See "Settings: `c.settings`" above. A product must still run sensibly with the
  defaults it declares — the app is optional, the knob is not.
- **Never write files from `product.py`. Ever.** The brain's filesystem is FAT on
  raw flash; a power cut during *any* write can wipe the whole directory —
  bench-proven (DEV-18, 15 Sep 2026: three pulls, three losses, one total). And
  unplugging is how a product is switched off. The filesystem is **read-only to
  the program** while a product runs: a plain `open(..., "w")` raises `OSError`,
  and `noknok.write_atomic()` is for the brain's setup/OTA moments only, not
  for products. Keep runtime state in RAM. If something genuinely must persist
  across power cycles, use the brain's runtime Store — it never touches the
  filesystem, but **it is not power-safe**: a cut during a Store write loses the
  whole record, so design every value to be self-healing (a sensible default is
  fine, a lost value must never break the product):
  `noknok.store().set("my_product", {...})` / `.get("my_product")` — small
  values only (< 1 KB), written **only when the value changed, never in a
  loop**. App-visible settings will be `c.settings` (DEV-34), built on the same
  Store. Details: brain-Pico README → *Filesystem policy*.
- **Power budget is real.** Each lit RGB LED (SK6812) can pull ~50–60 mA. Ten
  buttons at full brightness ≈ 0.5–0.6 A — more than the Pico's 3V3 regulator
  should source. High-count-LED products must be powered from the 5 V rail via a
  **PowerHub**, not bus-powered from a laptop. Flag power to Sam early.
- **One I2C bus, many ports.** All I2C modules share a single bus; a PicoHub has
  a limited number of physical ports, so high module counts need Qwiic
  branches / a hub to fan out. Electrically fine (that's what enumeration is
  for) — but it needs a wiring plan.
- **Product code has little RAM: keep the script under ~30 KB.** The brain
  reads the whole `product.py` into RAM to run it and keeps that text there, next
  to everything the brain itself needs. A 45 KB product (comments included) stopped
  with `MemoryError` on a Pico 2 W, and right after setup even a 37 KB one can
  (DEV-236). Comments count, because the source text is what sits in RAM. For a
  big product, keep the readable source in `poc/scripts/src/` and publish the
  comment-free copy made by `poc/tools/compact_product.py` (see the poc README).
  More room for makers is planned (roadmap RDM-21).
- **Not every module has a library driver yet.** Check `noknok.py` for a
  `Noknok<Module>` class before you rely on a module.
- **File header.** Start scripts with the SPDX header
  (`# SPDX-License-Identifier: MIT`) followed by a `# <filename> — <title>`
  comment block. (Some older scripts predate this — match the newer ones.)

---

## A product that needs more power: the PicoHub (`c.picohub`)

On a noknok PicoHub the board chooses its input voltage by demand (9 V up to 20 V) and protects
itself; a product only steps in when it knows better. Example: a mezzanine that needs 20 V.

```python
c = Conductor()
c.enumerate()
hub = c.picohub                        # None when the brain is not on a PicoHub
if hub:
    if hub.set_min_input_voltage(20) == hub.NO_POWER:
        print("this charger cannot give 20 V - use a stronger USB-C PD charger")
    s = hub.status()
    if "weak_charger" in s["warnings"]:
        print("weak charger: %.1f V / %.1f A" % (s["contract_v"], s["contract_a"]))
```

The minimum survives a reboot of the brain; set it back with `hub.set_min_input_voltage(None)`.
Full API: brain-Pico README → *noknok PicoHub power manager*. Catch `noknok.PicoHubError` if your
product must keep running when the board does not answer.

---

## Third-party boards (Qwiic / Stemma QT)

A product can also use ready-made Qwiic (SparkFun) / Stemma QT (Adafruit) boards next to noknok modules. The brain
recognises the supported ones and a product reads them like a module. Everything about what a board *is* (addresses,
how it is recognised, bus load, what it measures, how to remove its pull-up) lives in ONE file,
[`thirdparty-boards.json`](thirdparty-boards.json); a manifest only names the type.

**Declare it in the manifest:** add the board to `modules_required` with `"thirdparty": true`:

```json
"modules_required": [
  { "type": "buzzer",  "count": 1 },
  { "type": "veml7700", "count": 1, "thirdparty": true }
]
```

`type` must be a key of `thirdparty-boards.json` when `thirdparty` is true, and a noknok module type otherwise (the
schema checks both). Third-party boards have no firmware minimum: leave them out of `module_firmware`.

**Supported boards (registry 1.0.0):**

| `type` | Board | Addresses | Tested with |
|---|---|---|---|
| `veml7700` | Light sensor (VEML7700) | 0x10 | Adafruit 4162 |
| `tmp102` | Temperature sensor (TMP102) | 0x48, 0x49 ... | SparkFun SEN-16304 |
| `ads1115` | Analog input (ADS1115) | 0x48, 0x49 ... | generic copy of Adafruit 1085 |
| `lsm6dsox` | Motion sensor (LSM6DSOX) | 0x6A, 0x6B | Adafruit 4438 |
| `msa311` | Motion sensor (MSA311) | 0x62 | generic copy of Adafruit 5309 |
| `ssd1306` | OLED display (SSD1306) | 0x3C, 0x3D | Adafruit 4440 (0.91in 128x32) |
| `soldered_pir` | Motion detector (PIR) | 0x30, 0x31 ... | Soldered PIR with easyC V1.1.0 |

**Rules for the customer's hands (put them in your assembly guide):**
- Plug third-party boards in with the brain **unplugged**. There are no reserved addresses: the boot scan gives the noknok
  modules their addresses around the boards that are already there.
- Boards add pull-up resistors to the bus. Three or more boards on one bus can overload it; the app's bus check says which
  board to move to the other bus or which pull-up jumper to cut (`pullups.removable` / `how` in the registry).
- Two identical boards on one address cannot be told apart: use the board's address jumper.
- Known edge case (ADR-011): a board plugged in onto a noknok module's address while the PicoHub keeps the bus powered
  through a brain reset can hide that module until the next full power-off. Unplugging the brain fixes it.
- The library is only imported by products that list a third-party board (`noknok_thirdparty`, brain-Pico). The brain code
  that serves them (status rows, naming, bus check) follows DEV-248 / DEV-249; this chapter and the registry are the
  contract the app and the brain both read.

`python software/tools/check_thirdparty_registry.py` fails when the registry, the manifest schema and the brain
library disagree (addresses, types, removable pull-ups), so the three cannot drift apart.

**Use it in `product.py`:** enumerate the noknok modules first, then attach the boards. Each supported type gets a list
on the Conductor, like `c.buzzer`:

```python
from noknok import Conductor
import noknok_thirdparty as tp

c = Conductor()
c.enumerate()                 # noknok modules first
tp.attach(c)                  # then the boards: c.veml7700, c.tmp102, ... (lists, maybe empty)

if not c.veml7700 or not c.tmp102:
    raise RuntimeError("This product needs a VEML7700 light sensor and a TMP102")
light, temp = c.veml7700[0], c.tmp102[0]   # keep these objects

while True:
    lux = light.lux               # None = no reading this time: skip, like a module that did not answer
    t = temp.temperature          # degrees C or None
    ...
```

What to know:

- **Readings can be `None`** (I2C hiccup, chip still settling, two chips answering on one address). Never treat `None`
  as 0. After a bus power loss the driver sets its chip up again by itself; there is nothing to call.
- **`c.thirdparty`** holds every attached board; `m.read()` gives a dict of its capabilities (keys as in the registry).
- **Boards without an ID** (the Soldered PIR) are never probed. They show up in `c.unknown_devices` with their
  `candidates`, and the user names them in the app. A product that knows what is plugged in can name one itself:
  `tp.assign(c, "soldered_pir", "A", 0x30)`.
- **Pull-ups:** `tp.attach()` logs a warning when a bus is overloaded; `tp.pullup_warnings(c)` returns the same text.
- **RAM:** the core library is about 7 KB and each driver 0.9-2.3 KB, loaded only when its chip is present (about
  21.5 KB with all 7 boards, bench 18 Nov 2026). Products without third-party boards pay nothing.
- Full API per board (properties, options such as the OLED height): brain-Pico README,
  [Third-party Qwiic / Stemma QT boards](https://github.com/buildwithnoknok/brain-Pico#third-party-qwiic--stemma-qt-boards-dev-248).

## Worked example: Whack-a-Mole

The cleanest reference for the **symmetric-modules** pattern:

- Manifest: [`poc/manifests/whack-a-mole.json`](https://github.com/buildwithnoknok/poc/blob/main/manifests/whack-a-mole.json)
  — 10× `led_button` + `buzzer` + `knob`, `roles: []`, `config_schema: []`.
- Script: [`poc/scripts/whack_a_mole.py`](https://github.com/buildwithnoknok/poc/blob/main/scripts/whack_a_mole.py)
  — uses the whole `c.ledbutton` list, picks moles at random, difficulty chosen
  on the knob at runtime (not app config), screen-free score via buzzer + LEDs.

For a **role-based** product instead, read
[`poc/scripts/smart_lamp.py`](https://github.com/buildwithnoknok/poc/blob/main/scripts/smart_lamp.py)
— two identical knobs told apart by role, plus a combined USB + I2C setup.

---

## Publish checklist

1. Script in `poc/scripts/`, manifest in `poc/manifests/`, picture (optional) in
   `poc/images/<product-id>.webp`: WebP, 640 x 640 px, transparent background, max 60 KB,
   a real photo (CC BY-SA 4.0). Point the manifest's `image` at its raw `main` URL; without
   one the app shows a placeholder. See `product-manifest.md`.
   Maker products: `"source": "community"` and optionally `"maker": {"name", "url"}` for the
   credit; open a pull request into `poc` (contributing notes in the poc README). Merged to
   `main` = published.
2. **Run the validator** (DEV-255) and fix every ERROR:
   `python tools/validate_product.py <product-id>` from the poc repo root (`--all` for every
   product; `--folder <dir>` for an upload folder with `manifest.json`, `product.py`,
   `image.webp`, `README.md`). It checks the manifest against `product-manifest.schema.json`,
   the script (parses, size, SPDX header, no network / file writes / settings.toml / secrets)
   and the picture. Python 3 standard library only, works offline after the first run. The
   same check runs on every pull request; WARNINGs are for the human reviewer.
3. Manifest `files[].url` point at raw `main` URLs; `module_firmware` declares a
   `min` per module type.
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
out of scope — products compose existing modules only. **Before you hand a product back,
run `python tools/validate_product.py --folder <dir>` (poc repo) and fix every ERROR**; it
is the same check the pull request runs.
