# Firmware Updates (USB Bootloader)

How a noknok **USB** module gets new firmware **over USB, with no programmer and
no BOOT0 jumper**. The USB counterpart of [Firmware Updates (I2C Bootloader)](firmware-update.md).

> Applies to all CH32V203 USB modules (e.g. the LEDs module). The I2C modules
> (CH32V003) use the separate [I2C bootloader](firmware-update.md) — same idea,
> different transport.

## Overview

Each CH32V203 USB module carries a small **bootloader** (flashed once at manufacture)
plus an **application** region that can be re-flashed over USB for the life of the
product. Since bootloader 2.0.0 (**flash layout 4**) the bootloader itself can also be
updated over USB: see [Bootloader self-update (layout 4)](#bootloader-self-update-layout-4)
below. The Conductor (Pico, as USB host) — or the noknok app — drives the
update: it puts the module into the bootloader, streams a new application image, the
bootloader CRC-verifies it, then boots it. An interrupted flash never bricks a module:
the bootloader stays in flashing mode and waits for a retry, and the WCH factory ROM
bootloader (BOOT0 jumper) remains an unbrickable backstop.

This means a customer can receive a firmware update through the app with no cable; a
physical jumper/programmer connection is only ever needed once, at manufacture.

## Why not the factory ROM bootloader

The CH32V203 has a factory USB bootloader in ROM, but it is **not reachable from
running firmware** (both the boot-mode latch and a direct jump to `0x1FFF8000` were
bench-proven not to work — they need a true power/pin reset). So noknok ships its own
minimal USB-CDC bootloader, entered via the same **magic-in-RAM + warm reset** pattern
the I2C modules use. Full rationale is in the design page linked below.

## Reserved values (firmware standard)

These are fixed across the USB modules — every CH32V203 module honours them:

| Item | Value |
|------|-------|
| Bootloader region | 8 KB at `0x08000000`. Up to 1.1.0 one immutable image; from 2.0.0 (layout 4) stage-0 `0x08000000` (1 KB, frozen) + stage-1 `0x08000400` (7 KB, updatable over USB) |
| Application offset | `0x08002000` (apps relinked here; ~23.75 KB up to 1.1.0, 23.5 KB on layout 4). **The same on both**, so one app image runs under 1.1.0 and 2.0.0 |
| Stage-1 control block (layout 4) | `0x08007E00` (256 B): pending stage-1 update for stage-0 |
| Metadata (validity marker) | `0x08007F00` (256 B): `{magic 0x6E6B5542, app_len, app_crc32}` |
| Bootloader USB identity | VID `0x1209` / PID `0x4E42` (the application is PID `0x4E4E`) |
| `ENTER_BOOTLOADER` command | `0xB0` (over CDC) |
| Handoff RAM cell | `0x200027F0` (top 16 B of RAM, reserved in every module) |
| CRC32 | zlib (polynomial `0xEDB88320`) |
| Status LED | PB8 / BOOT0 (**active-high**, per-board; the I2C active-low rule is not forced onto USB) |

Every updatable application MUST be linked at the `0x2000` offset, reserve the handoff
RAM cell, and implement `0xB0`. The manifest `.bin` for a module is this offset-linked
application image — the bootloader is a separate binary and is never part of the OTA
payload. (This is the USB analogue of the I2C `0x1400` relink rule, flash layout 2.)

## A device that changes USB PID mid-update

Unlike I2C (one stable bus address the whole time), a USB module **changes its USB PID**
across an update — `app 0x4E4E → bootloader 0x4E42 → app 0x4E4E` — so the host must
**re-enumerate** the device at each transition and match it by its chip-UID serial (the
bootloader reports the same serial as the app). The Pico-side flasher handles this; it
is the one behaviour that has no I2C equivalent. On a Pico brain the USB host does not see
a re-enumeration within one host session, so the brain's update goes around hard resets:
send `0xB0`, reset, flash the module found waiting in its bootloader, reset, check the
version (brain-Pico `CHANGELOG.md`, code.py 0.27).

## Bootloader self-update (layout 4)

From USB bootloader **2.0.0** the CH32V203 bootloader is split like the I2C one
([bootloader-update.md](bootloader-update.md)): a tiny frozen **stage-0** that only installs
a pending update, and a **stage-1** (the USB-CDC bootloader) that can be replaced over USB.

```
stage-1 update:  0xB0 -> ERASE -> WRITE xN -> VERIFY_STAGE1(0x06, crc32) -> BOOT
                 -> (module detaches; stage-0 copies the new stage-1 into place)
                 -> new stage-1 enumerates as PID 0x4E42 -> push the application -> BOOT
```

- The new stage-1 is staged in the application region, so the app is gone afterwards: the
  host pushes it again (the module comes back **in the bootloader**, not in the app).
- `VERIFY_STAGE1` accepts only a V203 layout-4 stage-1 (header at `+0x100`: `NKS1`, base
  `0x0400`, layout 4, target `V203`); anything else is refused with error 8 (error 4 if the
  image is larger than the 7 KB stage-1 region) and nothing is armed.
- `0xB1 GET_VERSION` (bootloader only) answers `[proto, major, minor, patch, layout]`, e.g.
  `01 02 00 00 04`. A 1.x bootloader does not answer it. The first read right after the
  bootloader enumerates can come back empty: ask again before concluding "1.x".
- `BOOT` with no valid app stays in the bootloader (error 6) instead of jumping blind.
- Power-cut safe: the update marker is written only after the full CRC pass, stage-0
  re-checks the descriptor and the image CRC itself, verifies every page and redoes an
  interrupted copy at the next power-on.
- A module still on 1.x gets stage-0 **once** by a full-image flash (BOOT0 jumper +
  WCHISPTool, or SWD). A 1.x bootloader cannot do it: it never writes below `0x2000`.

The stage-1 index for this chip family is `module-USB-bootloader/firmware/index_v203.json`
(registry `bootloader.stage1.CH32V203`, see [firmware-index.md](firmware-index.md)).

## Unified across both buses (Conductor)

The Pico Conductor exposes a single OTA entry point that works for **both** buses:
`firmware_report()` flags out-of-date modules (each entry carries a `bus` field), and
`update_module()` / `update_all()` route each module to the right flasher — the I2C
`ModuleFlasher` or the USB `UsbModuleFlasher`. So a mixed I2C + USB product updates all
its modules through one call. See `brain-Pico/software/` (`noknok.py`, `noknok_usb.py`).

## Full detail

The command set, flash map and changelog are in the bootloader repository
[module-USB-bootloader](https://github.com/buildwithnoknok/module-USB-bootloader); the Pico-side
flow (update and rescue around a hard reset) is in the brain-Pico `README.md`. The rationale
(why a custom bootloader, what is not built yet) is in noknok's internal design page.

## Related documentation

- [Software Guidelines](readme.md)
- [Firmware Updates (I2C Bootloader)](firmware-update.md)
- [Enumeration Protocol](enumeration.md)
- [Role Assignment](roles.md)
