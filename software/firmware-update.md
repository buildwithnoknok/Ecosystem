# Firmware Updates (I2C Bootloader)

How a noknok I2C module gets new firmware **over the I2C bus, with no SWD cable**.

> Applies to all CH32V003 I2C modules (Buzzer, Knob, LED Button, Display — same bootloader,
> same flash layout 2) and, since DEV-124 (Oct 2026), to the **CH32X035 power manager of the noknok
> PicoHub** (module type `0x07`, flash layout 3 — see "Other chips" below). USB-C modules (CH32V203) use the same idea over a different
> transport, with a simpler single-stage bootloader — see
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
| Bootloader region | 5 KB at `0x0000` — since DEV-31 (Sep 2026) a **frozen 1 KB stage-0** plus a **field-updatable 4 KB stage-1** at `0x0400` (layout 2; the original monolithic bootloader was 4 KB with apps at `0x1000`). See [Bootloader Updates & World Migration](bootloader-update.md). |
| Application offset | `0x1400` (layout 2, apps relinked here, ~10.9 KB region). Layout-1 / legacy apps at `0x1000` do not run on a layout-2 module. |
| Bootloader I2C address | `0x7E` |
| `ENTER_BOOTLOADER` command | `0xB0` |
| Handoff RAM cell | `0x200007F0` (top 16 B of RAM, reserved in every module) |
| CRC32 | zlib (polynomial `0xEDB88320`) |
| Status LED | SWIO / PD1 (active-low). Stage-1 v1.2.0 only toggles it in flash mode; the full scheme (SDI takeover, per-state patterns) is planned — see below |

Every updatable application MUST be linked at the `0x1400` offset, reserve the handoff
RAM cell, implement `0xB0`, **run the independent watchdog, and clear the boot-attempt
counter once its I2C address is assigned** (the app-side contract in
[bootloader-update.md §3](bootloader-update.md) — this is what lets a module survive a
broken application release). The manifest `.bin` for a module is this offset-linked
application image — the bootloader is a separate binary and is never part of the
application OTA payload. A stage-1 (bootloader) image is a separate payload delivered by
the same transport.

## Other chips: the CH32X035 (noknok PicoHub power manager)

The same stage-0 / stage-1 bootloader, protocol and brain flow run on the CH32X035 that manages the
noknok PicoHub's power: one shared core, one small port per chip (repo `module-I2C-bootloader`,
`firmware/port/`; its README section "Chip ports" is the authoritative table). What a host or an
app author needs to know:

| Item | CH32V003 modules | CH32X035 (PicoHub) |
|------|------|------|
| Flash layout id (`0xB1` byte 5, `index.json` `layout`) | 2 | **3** |
| Application offset / region | `0x1400`, ~10.9 KB | `0x1400`, 56 KB |
| Handoff RAM cell | `0x200007F0` | `0x20004FF0` |
| Application header | none | required: 16 B at app base + `0x200`, `{"NKA1", "X035", 3, version}`; `VERIFY` refuses an image without it with **error 9** |
| `WRITE_CHUNK` | 64 B = one flash page | 64 B, four chunks make one 256 B flash page (no protocol change) |

Layout ids are unique across chip families, so the brain's exact layout gate (see
[firmware-index.md](firmware-index.md)) never sends one chip's image to another, and each chip's
stage-1 refuses the other's stage-1 (error 8). While the X035 is in its bootloader the PicoHub keeps
running on its hardware defaults (buses on, Pico powered, J2 and the mezzanine 5 V off); details in
the PicoHub repo's `firmware/readme.md`.

## Status LED & the SWIO flashing window (Flashing Interface V3)

> **Status: target design, not implemented yet (planned, DEV-22).** What the released
> stage-1 (v1.2.0) actually does today: it never disables SDI, has no SWD window, and in
> flash mode (at `0x7E`) toggles PD1 at one fixed rate; there is no per-state blink scheme.
> The Conductor (`noknok.py`) sends no "go" broadcast on the I2C general call `0x00`.
> Everything below this box describes the planned scheme.

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

**Bench restore without a Pico (SWD):** flash ONE combined 16 KB image = stage-0@`0x0000` + stage-1@`0x0400` +
app@`0x1400` + metadata@`0x3FC0` `{magic 0xB007C0DE, app_len, zlib.crc32(app)}` (little-endian) — `mk_full.py` in the bootloader repo builds exactly this —
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

- [Bootloader Updates & World Migration](bootloader-update.md) — updating the bootloader itself; the runbook
- [Software Guidelines](readme.md)
- [Firmware Updates (USB Bootloader)](firmware-update-usb.md)
- [Enumeration Protocol](enumeration.md)
- [Role Assignment](roles.md)
