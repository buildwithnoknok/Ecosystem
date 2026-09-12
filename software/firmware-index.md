# Module Firmware Index (`firmware/index.json`)

Every module repo publishes one small file that answers a single question:
**what is the current firmware for this module, and what does it need in order to
run?**

It lives next to the binary it describes:

```
module-I2C-buzzer/
  firmware/
    bin/buzzer_firmware.bin
    index.json              <- this file
```

## Why this exists

Product manifests used to pin an exact firmware version *and* a download URL —
the version in the `poc` repo, the bytes in the module repo. Two repos, one
fact, no link between them. The URL pointed at `main`, so it always served the
newest binary while the manifest still claimed an old version number. The two
drifted apart silently.

That drift is not cosmetic. On 11 Sep 2026 all four CH32V003 apps were relinked
from `0x1000` to `0x1400` for bootloader layout 2. The new images are fully
backwards compatible at the protocol level and will still hard-fault a module
running the legacy monolithic bootloader, because the break is in *where the
code expects to live*, not in what it says on the wire. A manifest pinning
`2.2.0` would happily have fetched that image and bricked the module.

Two conclusions shape this file:

1. **The version belongs in the same commit as the binary.** Then they cannot
   disagree. That is the whole design.
2. **Backwards compatibility is a promise about the protocol, not about
   installability.** Some firmware cannot be installed on some modules. Only the
   firmware author knows when that is true, so the firmware declares it.

## The file

```json
{
  "module": "buzzer",
  "version": "3.5.0",
  "url": "https://raw.githubusercontent.com/buildwithnoknok/module-I2C-buzzer/main/firmware/bin/buzzer_firmware.bin",
  "layout": 2,
  "released": "2026-09-11"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `module` | yes | Module type string, from the manifest controlled vocabulary (`buzzer`, `knob`, `led_button`, `usb_leds`, `display`, …). |
| `version` | yes | Semver of the binary at `url`. **Must match what the firmware reports over `0xB1 GET_VERSION`** — that equality is what lets the brain decide without downloading anything. |
| `url` | yes | Raw URL to the `.bin`. Pointing at `main` is fine: index and binary move together in one commit, so there is nothing to drift. |
| `layout` | I²C: yes | The **flash layout this image is linked for**. See below. Omit for USB (CH32V203) modules until the stage-0 port lands. |
| `released` | no | ISO date, for humans reading the file. |

### `layout` — the flash layout the image is linked for

An application image is linked for one place in flash (its *app base*). The
bootloader writes at the base **it** knows. The CRC is computed over image
bytes, not the link address. So an image linked for the wrong layout passes
every check the bootloader has and then hangs the module the moment it runs.

| `layout` | Bootloader | App base | Stage-1 version |
| --- | --- | --- | --- |
| `0` | legacy monolithic | `0x1000` | none — does not answer `0xB1` |
| `1` | stage-0 / stage-1 | `0x1000` | 1.0.x |
| `2` | stage-0 / stage-1 | `0x1400` | 1.1.x |

Read it off the module's `app.ld` `ORIGIN`: `0x1000` under stage-1 1.0.x is
layout 1, `0x1400` is layout 2.

**The match is exact.** A "newer" bootloader is not a "compatible" one:
layouts 1 and 2 both answer `0xB1` and are mutually unrunnable. The brain
derives a module's layout from the stage-1 version it reports
(`Conductor.bootloader_layout()`, table `Conductor.STAGE1_LAYOUTS`), refuses on
a mismatch, and **fails closed** — an index with no `layout` for an I²C module,
or a stage-1 version the Conductor does not know, is refused rather than
guessed at. A module on the wrong layout must be moved over SWD; it cannot get
there over the bus.

> This field replaced an earlier `requires_bootloader: legacy | stage1 | any`
> on 12 Sep 2026, after the coarser check passed a layout-2 image to a layout-1
> buzzer on the bench and hung it. Legacy-vs-stage-1 was one level too coarse.

Every new layout is a new stage-1 minor version and a new row in
`Conductor.STAGE1_LAYOUTS`. Longer term the bootloader should report its layout
id directly over the bus so the table can go.

## Finding it — the module registry

A product manifest names module *types*, not repos, so the brain needs one lookup
from type to index URL. That is [`modules.json`](modules.json) in this directory:

```json
{
  "registry_version": "1.0.0",
  "modules": {
    "buzzer": {
      "repo": "module-I2C-buzzer",
      "index": "https://raw.githubusercontent.com/buildwithnoknok/module-I2C-buzzer/main/firmware/index.json"
    }
  }
}
```

One file, one fetch, and the only place a module repo's location is written down.
Adding a module type to the ecosystem is a line here — **not** a change to every
product manifest, and not a Pico library update.

> **A module's repo must be public** for the brain to fetch its index over a raw
> URL. `module-I2C-1.42-display` is private, so it has no registry entry yet and
> the brain will not manage its firmware; add the entry when the repo goes
> public. A type missing from the registry is a safe no-op — it is logged and no
> firmware is installed for it.

## How the brain uses it

At provisioning, for each module type the product needs:

1. Read the product manifest's floor — `module_firmware: { "buzzer": { "min": "3.3.1" } }`.
2. Look the type up in `modules.json` and fetch the module's `index.json`.
3. If `index.version` is **below** the product's `min`, refuse: the product needs
   a firmware feature that has not shipped. This should never happen in practice
   and means someone published a product against an unreleased firmware.
4. Compare `index.version` to what the module reports installed. Equal or newer
   installed → nothing to do.
5. Otherwise check `layout` against the module's actual bootloader layout —
   exact match. Mismatch → refuse and log it, rather than flashing an image the
   module cannot run.
6. Fetch and flash.

Net effect: **modules converge on the newest firmware automatically**, products
never need editing when firmware improves, and the one case that bricks a module
is refused instead of attempted.

## What to do when cutting a firmware release

Same commit, every time:

1. Build, and update `firmware/bin/<module>_firmware.bin`.
2. Bump the version in the source (the `GET_VERSION` reply) **and** in the
   README changelog.
3. Set `version` in `index.json` to the same number.
4. Set `layout` to match the image's `app.ld` `ORIGIN` — it changes only when
   the app is relinked for a new stage-1.

If step 3 is skipped, the fleet simply does not see the release — the brain
never downloads a binary it has not been told about. That is the intended
failure mode: silent no-op, not a silent mismatch.

## Related

- `product-manifest.schema.json` — the `module_firmware` floor.
- `authoring-products.md` — writing a product manifest.
- `bootloader-update.md` — the stage-0 / stage-1 runbook (DEV-31).
- `firmware-update.md` / `firmware-update-usb.md` — the OTA transport.
