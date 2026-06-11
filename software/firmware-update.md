# Firmware Updates (I2C Bootloader)

How a noknok I2C module gets new firmware **over the I2C bus, with no SWD cable**.

> Applies to all CH32V003 I2C modules (Buzzer, Knob, LED Button). USB-C modules
> (CH32V203) are out of scope and will use a separate mechanism.

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
| Status LED | SWIO / PD1 (active-low, optional per board) |

Every updatable application MUST be linked at the `0x1000` offset, reserve the handoff
RAM cell, and implement `0xB0`. The manifest `.bin` for a module is this offset-linked
application image — the bootloader is a separate binary and is never part of the OTA
payload.

## Full detail

The complete wire protocol (flash map, the `0x7E` flashing command set, the boot
decision, brick-safety, and recovery/SWD procedure) lives in the canonical open repo
and a Confluence design page — this file stays a high-level pointer to avoid drift:

- **Source of truth:** [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader)
  — the bootloader README is the authoritative protocol reference.
- **Full detail (archived):** Confluence —
  [Module Firmware Update — I2C Bootloader Protocol (Full Detail)](https://noknokdev.atlassian.net/wiki/spaces/SD/pages/80478209)
  (child of *I²C Module Bootloader — Design & Process*).

## Related documentation

- [Software Guidelines](readme.md)
- [Enumeration Protocol](enumeration.md)
- [Role Assignment](roles.md)
