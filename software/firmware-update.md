# Firmware Updates (I2C Bootloader)

How a noknok I2C module gets new firmware **over the I2C bus, with no SWD cable**.

> Applies to all CH32V003 I2C modules (Buzzer, Knob, LED Button). USB-C modules
> (CH32V203) use the same idea over a different transport — see
> [Firmware Updates (USB Bootloader)](firmware-update-usb.md).

## Overview

Each CH32V003 module carries a small **bootloader** (fixed, SWD-flashed once at
manufacture) plus an **application** region that can be re-flashed over I2C for the
life of the product. The Conductor (Pico) drives the update: it puts the module into
the bootloader, streams a new application image, the bootloader CRC-verifies it, and
then boots it. An interrupted flash never bricks a module — the bootloader simply
waits for a retry, and SWD remains an unbrickable backstop.

This means a customer can receive a firmware update through the app with no cable; a
physical SWD connection is only ever needed once, at manufacture.

## Reserved values (firmware standard)

These are fixed across the ecosystem — every CH32V003 module honours them:

| Item | Value |
|------|-------|
| Bootloader region | 4 KB at `0x0000` (immutable in the field) |
| Application offset | `0x1000` (apps relinked here, 12 KB region) |
| Bootloader I2C address | `0x7E` |
| `ENTER_BOOTLOADER` command | `0xB0` |
| Handoff RAM cell | `0x200007F0` (top 16 B of RAM, reserved in every module) |
| CRC32 | zlib (polynomial `0xEDB88320`) |
| Status LED | SWIO / PD1 (active-low); firmware disables SDI to drive it — see below |

Every updatable application MUST be linked at the `0x1000` offset, reserve the handoff
RAM cell, and implement `0xB0`. The manifest `.bin` for a module is this offset-linked
application image — the bootloader is a separate binary and is never part of the OTA
payload.

## Status LED & the SWIO flashing window (Flashing Interface V3)

The status LED sits on **PD1 — the SWIO debug pin** (active-low), so firmware must reclaim
the pin from the debugger before it can drive it. While SWD/SDI is enabled the debug module
owns PD1 and GPIO writes have no effect (this failed as-designed; fixed and **bench-validated
18 Aug 2026**, DEV-20).

**Boot sequence (in the bootloader):**

1. **~2 s SWD window** — PD1 left as SWIO, SDI live, so a plain SWD flash connects and
   reprograms normally (no unbrick). Keep it conditional: generous when there is no valid
   app, short/skipped when a valid app is present so products boot fast.
2. **SDI takeover** — `AFIO->PCFR1` `SWCFG = 0b100` (`AFIO_PCFR1_SWCFG_DISABLE`) releases PD1
   as a GPIO. (The bit is volatile — SDI is back on at every power-up.)
3. **Drive the LED**, then hand off to the app (SDI stays disabled; the app inherits PD1).

Because the LED can only be driven after the window, **bootloader/OTA status is also reported
over I2C — the authoritative channel**. OTA (I2C) flashing is unaffected by the SDI change;
only repeat *bench SWD* reflash of an already-programmed module is: catch the window, or use
`minichlink -u` (power-off unbrick, always works — no module is ever brickable).

**LED state scheme** (single-colour; glanceable only — I2C is machine-readable truth):

| State | LED |
|-------|-----|
| Power-on, booted | brief flash |
| In bootloader, no valid app | double-blink (~2 s period) |
| OTA updating | slow pulse (~1 Hz) |
| App running, address assigned, waiting | solid ON |
| Brain broadcasts "go" (all modules ready) | off |
| Error / fault | fast blink (~5 Hz) |

"off = healthy" keeps finished products dark in normal use. The "go" is a Conductor broadcast
(I2C general-call `0x00`) once all modules are enumerated and ready — a "booting → ready" cue.

**Read protection:** noknok modules ship **unprotected** — firmware is open (MIT), so RDPR
only adds bench-recovery friction. A protected board just needs one `minichlink -p` first.

**Bench restore without a Pico (SWD):** flash ONE combined 16 KB image = bootloader@`0x0000` +
app@`0x1000` + metadata@`0x3FC0` `{magic 0xB007C0DE, app_len, zlib.crc32(app)}` (little-endian),
then `minichlink -w combined.bin flash -b`. This hand-writes the same validity marker the OTA
`VERIFY` normally writes.

## Full detail

The complete wire protocol (flash map, the `0x7E` flashing command set, the boot
decision, brick-safety, and recovery/SWD procedure) is documented in noknok's internal
design page — this file stays a high-level overview to avoid drift:

- **Full detail:** Confluence —
  [Module Firmware Update — I2C Bootloader Protocol (Full Detail)](https://noknokdev.atlassian.net/wiki/spaces/SD/pages/80478209)
  (child of *I²C Module Bootloader — Design & Process*).

## Related documentation

- [Software Guidelines](readme.md)
- [Firmware Updates (USB Bootloader)](firmware-update-usb.md)
- [Enumeration Protocol](enumeration.md)
- [Role Assignment](roles.md)
