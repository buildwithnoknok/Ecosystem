# Firmware Updates (USB Bootloader)

How a noknok **USB** module gets new firmware **over USB, with no programmer and
no BOOT0 jumper**. The USB counterpart of [Firmware Updates (I2C Bootloader)](firmware-update.md).

> Applies to all CH32V203 USB modules (e.g. the LEDs module). The I2C modules
> (CH32V003) use the separate [I2C bootloader](firmware-update.md) — same idea,
> different transport.

## Overview

Each CH32V203 USB module carries a small **bootloader** (fixed, jumper-flashed once
at manufacture) plus an **application** region that can be re-flashed over USB for the
life of the product. The Conductor (Pico, as USB host) — or the noknok app — drives the
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
| Bootloader region | 8 KB at `0x08000000` (immutable in the field) |
| Application offset | `0x08002000` (apps relinked here, ~23.75 KB region) |
| Metadata (validity marker) | `0x08007F00` (256 B): `{magic 0x6E6B5542, app_len, app_crc32}` |
| Bootloader USB identity | VID `0x1209` / PID `0x4E4F` (the application is PID `0x4E4E`) |
| `ENTER_BOOTLOADER` command | `0xB0` (over CDC) |
| Handoff RAM cell | `0x200027F0` (top 16 B of RAM, reserved in every module) |
| CRC32 | zlib (polynomial `0xEDB88320`) |
| Status LED | PB8 / BOOT0 (**active-high**, per-board; the I2C active-low rule is not forced onto USB) |

Every updatable application MUST be linked at the `0x2000` offset, reserve the handoff
RAM cell, and implement `0xB0`. The manifest `.bin` for a module is this offset-linked
application image — the bootloader is a separate binary and is never part of the OTA
payload. (This is the USB analogue of the I2C `0x1000` relink rule.)

## A device that changes USB PID mid-update

Unlike I2C (one stable bus address the whole time), a USB module **changes its USB PID**
across an update — `app 0x4E4E → bootloader 0x4E4F → app 0x4E4E` — so the host must
**re-enumerate** the device at each transition and match it by its chip-UID serial (the
bootloader reports the same serial as the app). The Pico-side flasher handles this; it
is the one behaviour that has no I2C equivalent.

## Unified across both buses (Conductor)

The Pico Conductor exposes a single OTA entry point that works for **both** buses:
`firmware_report()` flags out-of-date modules (each entry carries a `bus` field), and
`update_module()` / `update_all()` route each module to the right flasher — the I2C
`ModuleFlasher` or the USB `UsbModuleFlasher`. So a mixed I2C + USB product updates all
its modules through one call. See `brain-Pico/software/` (`noknok.py`, `noknok_usb.py`).

## Full detail

The complete design (factory-ROM dead-ends, flash map, CDC flashing command set, boot
decision, brick-safety, the PID re-enumeration handling, and the Pico-side flasher +
Conductor dispatcher) is documented in noknok's internal design page — this file stays a
high-level overview to avoid drift:

- **Full detail:** Confluence —
  [USB Module Bootloader — Design & Process (CH32V203)](https://noknokdev.atlassian.net/wiki/spaces/SD/pages/85753857)
  (child of *noknok System Architecture — End Game*).

## Related documentation

- [Software Guidelines](readme.md)
- [Firmware Updates (I2C Bootloader)](firmware-update.md)
- [Enumeration Protocol](enumeration.md)
- [Role Assignment](roles.md)
