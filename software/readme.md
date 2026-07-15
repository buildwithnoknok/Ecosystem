# Software Guidelines

The firmware guidelines define how code is written for both sides of the noknok ecosystem:

- The **Conductor** (central MCU — Raspberry Pi Pico)  
- The **Musicians** (module MCUs — typically CH32V003 or CH32V203)

These rules ensure consistent behavior, predictable communication, and long‑term maintainability across all modules.

---

## 1. Primary Languages

### Python — Conductor (Raspberry Pi Pico)

The Conductor runs the main application logic, orchestration routines, and module coordination.

- **CircuitPython** is the standard language for all Conductor‑side code.
- Recommended IDE: **Thonny**
- Standard I2C pins: **GP8 = SDA, GP9 = SCL**
- The Conductor uses the `noknok.py` library which provides:
  - `Conductor` class — handles enumeration and module discovery
  - Per-module driver classes (e.g. `NoknokBuzzer`) — high-level API

### C — Module MCUs (CH32V003 / CH32V203)

Each module contains its own MCU and runs firmware written in **C** using the **ch32v003fun** framework.

- Modules expose a virtual I2C slave device with:
  - A 64‑bit unique hardware ID
  - A module type code
  - A runtime‑assigned I2C address (no hardcoded addresses)
  - A standard command interface for control and status

---

## 2. Toolchains

### Conductor (CircuitPython)

| Tool | Purpose |
|------|---------|
| CircuitPython | Runtime on Raspberry Pi Pico |
| Thonny IDE | Development and file management |
| `noknok.py` | noknok module library |

### Module MCUs (C)

| Tool | Purpose |
|------|---------|
| ch32v003fun | Build framework for CH32V003 / CH32V203 |
| RISC‑V GCC | Compiler (`riscv64-unknown-elf-gcc`) |
| minichlink | Flashing tool |
| WCH Link‑E | Programming adapter (SWDIO) |
| Raspberry Pi 4 | Build and flash host |

Build commands (from the module's `firmware/src/` directory on the RPi4):

```bash
make          # compile only
make flash    # compile and flash via WCH Link-E
```

---

## 3. Module Discovery & Enumeration

All I²C modules use the noknok dynamic enumeration protocol. There are no hardcoded addresses. Every module boots with I²C off, waits a UID-derived backoff delay (300–2799 ms), then joins the bus at staging address `0x7F`. The Conductor reads a 10-byte UID + type + CRC8 response, assigns a unique runtime address, and the module switches to it.

**→ Full specification: [software/enumeration.md](enumeration.md)**

This covers: backoff formula, state machine (4 states), byte protocol, CRC8, state persistence, the role system, and FAQ.

---

## 4. I²C Module Type Codes

Every I²C module reports its type in the enumeration response (byte 8). The Conductor uses this to instantiate the correct Python driver class.

> USB‑based modules do not use this enumeration protocol (they attach as USB devices and are identified by a chip‑UID serial). They share the same `0xB0`/`0xB1` standard commands and OTA model — see [Firmware Updates (USB Bootloader)](firmware-update-usb.md).

| Code | Module name | Python class |
|------|-------------|--------------|
| `0x01` | noknokbuzzer | `NoknokBuzzer` |
| `0x02` | noknokknob | `NoknokKnob` |
| `0x03` | noknokledbutton | `NoknokLedButton` |

---

## 5. Standard System Commands

Beyond each module's own function-specific commands, every noknok I²C module **must** implement a small set of standard commands that behave identically across the whole ecosystem. These let the Conductor manage *any* module — query it or update it — without knowing what kind of module it is.

### Reserved command range `0xB0–0xBF`

Command bytes **`0xB0` through `0xBF` are reserved ecosystem-wide** for standard system commands. A module must **never** reuse a byte in this range for its own function-specific commands. Each module continues to use lower command bytes (e.g. `0x00`–`0x7F`) for its own features (play note, set colour, reset position, …).

| Command | Byte | Direction | Description |
|---------|------|-----------|-------------|
| `ENTER_BOOTLOADER` | `0xB0` | write | Warm-reset into the shared I²C bootloader for an over-the-wire firmware update. See the [bootloader repo](https://github.com/buildwithnoknok/module-I2C-bootloader). |
| `GET_VERSION` | `0xB1` | write, then read 4 bytes | Report protocol + firmware version (see below). |
| *reserved* | `0xB2`–`0xBF` | — | Reserved for future standard commands. Do not use. |

### `GET_VERSION` (`0xB1`) — mandatory for all modules

Lets the Conductor read a module's **installed** firmware version so it can compare it against the version **required** by the product manifest (`module_firmware[type].version`) and decide whether an update is needed. This is the prerequisite for the module-firmware update flow (PoC v1: log "update available"; PoC v2: flash over the I²C bootloader).

**Wire sequence** (at the module's runtime address, after enumeration):

1. Conductor **writes** one byte: `0xB1`.
2. Conductor **reads 4 bytes**:

| Byte | Field | Meaning |
|------|-------|---------|
| 0 | `PROTOCOL_VERSION` | The noknok protocol/API version this module speaks (`0x01` today). Tells the Conductor *which command set and wire formats* the module honours. Independent of the firmware version — bumped only when the shared protocol itself changes. |
| 1 | `FW_MAJOR` | Firmware major version |
| 2 | `FW_MINOR` | Firmware minor version |
| 3 | `FW_PATCH` | Firmware patch version |

After the read, the module returns to its normal read behaviour (its status/data bytes). The version is readable **at any time** during normal operation, not only at boot.

**Why a dedicated command and not part of enumeration:** the 10-byte enumeration response (`[UID×8][TYPE][CRC8]`) is a fixed, stable wire format. Version reporting is kept separate so the enumeration format never has to change and the version can be re-read whenever needed.

**Semantic versioning:** firmware versions follow [semver](https://semver.org) — `MAJOR.MINOR.PATCH` — matching the manifest convention. The Conductor logs "update available" when the reported version is lower than the manifest's required version (PoC v1); PoC v2 triggers the I²C-bootloader OTA flash.

**Firmware implementation notes (CH32V003):** the command is recognised in the `DEV_ASSIGNED` state. Receiving `0xB1` sets a one-shot `version_pending` latch **inside the I²C ISR at the STOP condition** — the same place the `0x1D` assign command is handled — so the very next read returns the version bytes race-free (no dependency on the main loop running first). `PROTOCOL_VERSION` and `FW_VERSION_{MAJOR,MINOR,PATCH}` are `#define`d at the top of each module's firmware and kept equal to the module's released version tag.

---

## 6. Firmware Conventions

- **Non-blocking**: Module firmware must never block on `Delay_Ms()` during normal operation. Use hardware timers (TIM2 as 1 ms tick) for all timing.
- **Fire and forget**: The Conductor sends a command and returns immediately. The module handles all timing internally.
- **Interrupt on new command**: Any new command immediately overrides what is currently playing/running.
- **Startup confirmation**: Every module plays or signals a startup sequence on boot (e.g. a chime or LED flash) to confirm it is alive. This runs during the backoff period before I2C is enabled.
- **CRC on UID response**: The 10‑byte enumeration response must always include a valid CRC8 byte.

---

## 7. State Persistence

After enumeration, the Conductor saves module assignments to `noknok_state.json` on the Pico. On the next run, it pings each saved address first. Modules that respond are restored immediately without re-running the `0x7F` enumeration cycle.

```
First run:   enumerate() → finds modules on 0x7F → saves noknok_state.json
Second run:  enumerate() → pings saved addresses → all respond → restored instantly
Power cycle: enumerate() → modules not at saved addresses → full 0x7F scan
```

> **Filesystem write access required.** The Pico filesystem must be writable from code for `noknok_state.json` and `noknok_roles.json` to be saved. See the [CircuitPython filesystem docs](https://docs.circuitpython.org/en/latest/docs/library/storage.html).

---

## 8. Summary

| Topic | Standard |
|-------|---------|
| Conductor language | CircuitPython |
| Module language | C (ch32v003fun) |
| I2C standard | 3.3 V, 100 kHz, JST SH 4‑pin |
| Address assignment | Dynamic — FNV‑1a backoff enumeration |
| Staging address | `0x7F` |
| Runtime address pool | `0x08–0x77` |
| UID size | 64‑bit (8 bytes) |
| Enumeration response | 10 bytes (UID + type + CRC8) |
| Standard system commands | `0xB0`–`0xBF` reserved ecosystem-wide |
| Version reporting | `GET_VERSION` (`0xB1`) → 4 bytes `[protocol, major, minor, patch]` |
| Max modules per bus | ~20 (total boot time ≈ 3–4 s) |
| Hardcoded addresses | **Never** |

---

## 9. Related Documentation

- [Authoring a noknok Product](authoring-products.md) — how to build a new product (manifest + product.py)
- [Product Manifest schema](product-manifest.schema.json) — machine-checkable manifest spec
- [Enumeration Protocol — full spec](enumeration.md)
- [Firmware Updates (I2C Bootloader)](firmware-update.md)
- [Firmware Updates (USB Bootloader)](firmware-update-usb.md)
- [Role Assignment](roles.md)
- [Electrical Guidelines](../electrical/readme.md)
- [Mechanical Guidelines](../mechanical/readme.md)

---

## 10. Safety & Responsibility Disclaimer

The overall guidelines described in this repository are intended to support reproducible, modular, and maker‑friendly designs within the noknok ecosystem. They do **not** replace professional engineering judgment.

By using these guidelines, you acknowledge that:

- You are responsible for ensuring **electrical safety**, **mechanical safety**, and **structural integrity** of your designs.
- You must verify that your modules, housings, and assemblies comply with relevant **local regulations**, **material limitations**, and **use‑case requirements**.
- noknok and its contributors are not liable for damages resulting from improper design, manufacturing, or use of modules or housings.

These guidelines are provided **as‑is** to support creativity and reproducibility in the community.