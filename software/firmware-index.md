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
  "requires_bootloader": "stage1",
  "released": "2026-09-11"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `module` | yes | Module type string, from the manifest controlled vocabulary (`buzzer`, `knob`, `led_button`, `usb_leds`, `display`, …). |
| `version` | yes | Semver of the binary at `url`. **Must match what the firmware reports over `0xB1 GET_VERSION`** — that equality is what lets the brain decide without downloading anything. |
| `url` | yes | Raw URL to the `.bin`. Pointing at `main` is fine: index and binary move together in one commit, so there is nothing to drift. |
| `requires_bootloader` | yes | What must be on the module for this image to be installable. See below. |
| `released` | no | ISO date, for humans reading the file. |

### `requires_bootloader`

| Value | Meaning |
| --- | --- |
| `legacy` | Runs under the original monolithic bootloader (CH32V003 app base `0x1000`). |
| `stage1` | Needs the stage-0 / stage-1 bootloader, layout 2 (app base `0x1400`). A module on the legacy bootloader must be re-flashed over SWD first — it cannot get there over the bus. |
| `any` | Installability does not depend on the bootloader generation. Use this for the USB (CH32V203) modules until the stage-0 port lands. |

The brain resolves this by asking the module directly: `Conductor.bootloader_version()`
returns `None` for a legacy bootloader (it does not implement `0xB1`) and a
version tuple for stage-0/stage-1. Silence means old world. See
`bootloader-update.md`.

## How the brain uses it

At provisioning, for each module type the product needs:

1. Read the product manifest's floor — `module_firmware: { "buzzer": { "min": "3.3.1" } }`.
2. Fetch the module's `index.json`.
3. If `index.version` is **below** the product's `min`, refuse: the product needs
   a firmware feature that has not shipped. This should never happen in practice
   and means someone published a product against an unreleased firmware.
4. Compare `index.version` to what the module reports installed. Equal or newer
   installed → nothing to do.
5. Otherwise check `requires_bootloader` against the module's actual bootloader.
   Mismatch → refuse and log it, rather than flashing an image the module cannot
   run.
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
4. Set `requires_bootloader` if the relink/layout situation changed.

If step 3 is skipped, the fleet simply does not see the release — the brain
never downloads a binary it has not been told about. That is the intended
failure mode: silent no-op, not a silent mismatch.

## Related

- `product-manifest.schema.json` — the `module_firmware` floor.
- `authoring-products.md` — writing a product manifest.
- `bootloader-update.md` — the stage-0 / stage-1 runbook (DEV-31).
- `firmware-update.md` / `firmware-update-usb.md` — the OTA transport.
