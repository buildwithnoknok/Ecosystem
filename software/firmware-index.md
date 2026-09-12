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
  "size": 2980,
  "crc32": "7dc9883d",
  "released": "2026-09-11"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `module` | yes | Module type string, from the manifest controlled vocabulary (`buzzer`, `knob`, `led_button`, `usb_leds`, `display`, …). |
| `version` | yes | Semver of the binary at `url`. **Must match what the firmware reports over `0xB1 GET_VERSION`** — that equality is what lets the brain decide without downloading anything. |
| `url` | yes | Raw URL to the `.bin`. Pointing at `main` is fine: index and binary move together in one commit, so there is nothing to drift. |
| `layout` | I²C: yes | The **flash layout this image is linked for**. See below. Omit for USB (CH32V203) modules until the stage-0 port lands. |
| `size` | yes | Byte length of the `.bin`. |
| `crc32` | yes | zlib CRC32 of the `.bin`, lower-case hex, no prefix (`python3 -c "import zlib,sys;print('%08x'%zlib.crc32(open(sys.argv[1],'rb').read()))" firmware/bin/x.bin`). |
| `released` | no | ISO date, for humans reading the file. |
| `format` | no | Schema version of this file; absent means `1`. A brain skips an index (or registry) whose `format` is newer than it understands — fail closed, so a future schema change can never be misread by an older brain in the field. Bump it only when a change would break an old reader. |

`size` and `crc32` are what let the brain **verify a download before it touches
a module**. The bootloader's own CRC cannot catch a truncated or corrupted
download — it is computed over whatever bytes the brain sends — so without them
a short download would be flashed, pass verification, hang the module, get
parked, and be downloaded again. The brain checks both when present and logs a
warning when absent. Generate them from the binary in the same commit; never
type them by hand.

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
layouts 1 and 2 both answer `0xB1` and are mutually unrunnable. **The
bootloader states its own layout** — byte 4 of stage-1's `0xB1` reply, since
stage-1 1.2.0 — and the brain (`Conductor.bootloader_layout()`) compares it to
the index. Nothing host-side infers a layout from a version number. It refuses
on a mismatch and **fails closed**: an index with no `layout` for an I²C module,
a legacy bootloader (no `0xB1`), or a stage-1 older than 1.2.0 (answers `0` for
the layout byte — "did not say") is refused rather than guessed at. A module on
the wrong layout, or on a stage-1 too old to say, must be moved with a stage-1
update or over SWD; it cannot receive an app until it can state its layout.

> This field replaced an earlier `requires_bootloader: legacy | stage1 | any`
> on 12 Sep 2026, after the coarser check passed a layout-2 image to a layout-1
> buzzer on the bench and hung it. Legacy-vs-stage-1 was one level too coarse.
> The same day, stage-1 1.2.0 started reporting its layout on the bus, so the
> interim host-side version→layout table was retired before it shipped anywhere.

Every new layout is a new stage-1 minor version; the bootloader reports it and
the index declares it, and that is the whole contract.

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

**When:** on the first connected boot after provisioning, then at most **once
every 24 hours** (the time of the last completed check is kept in the brain's
non-volatile memory, not its filesystem, and survives a power cycle). Other
boots make no GitHub round-trips at all; a parked module is still rescued from
the on-device cache. On that first boot the brain also **warms the cache** —
fetches the current image for every I²C type the product uses — so any of them
can be rescued later without the internet.

**Per module, not per type:** if a type has several modules and one cannot
run the new image (wrong flash layout), only that one is refused; the others
still update.

On a due check, for each module type the product needs:

1. Read the product manifest's floor — `module_firmware: { "buzzer": { "min": "3.3.1" } }`.
2. Look the type up in `modules.json` and fetch the module's `index.json`.
3. If `index.version` is **below** the product's `min`, refuse: the product needs
   a firmware feature that has not shipped. This should never happen in practice
   and means someone published a product against an unreleased firmware.
4. If the on-device cache for this type is not already `index.version` with the
   matching `crc32`, download the image, verify it against `size` and `crc32`,
   and store it with a sidecar. **All downloads happen here, before the brain
   talks to any module** — a download attempted after the module bus has been
   brought up can hang on this board.
5. Bring up the bus. Compare `index.version` to what each module reports
   installed. Equal or newer installed → nothing to do.
6. For each outdated module, check `layout` against that module's own
   bootloader layout — exact match. Mismatch → refuse that module and tell the
   customer (buzzer error motif, LED Buttons red), rather than flashing an image
   it cannot run. The other modules of the type still update.
7. Flash from the cache. The network is not involved from here on.

The cache is kept: it is also the source for rescuing a module parked in its
bootloader when there is no internet.

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
5. Regenerate `size` and `crc32` from the new binary (see the field table).

A CI check in each module repo — `layout` matches `app.ld` `ORIGIN`, `size` and
`crc32` match the committed binary, `version` matches the source — catches the
human error at the source, before a brain ever fetches it.

If step 3 is skipped, the fleet simply does not see the release — the brain
never downloads a binary it has not been told about. That is the intended
failure mode: silent no-op, not a silent mismatch.

## Related

- `product-manifest.schema.json` — the `module_firmware` floor.
- `authoring-products.md` — writing a product manifest.
- `bootloader-update.md` — the stage-0 / stage-1 runbook (DEV-31).
- `firmware-update.md` / `firmware-update-usb.md` — the OTA transport.
