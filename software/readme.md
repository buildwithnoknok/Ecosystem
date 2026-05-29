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
  - A standard register map for control and status

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

Build commands (from the module's firmware directory on the RPi4):

```bash
make          # compile only
make flash    # compile and flash via WCH Link-E
```

---

## 3. Module Discovery & Enumeration

**Every module must implement this exact enumeration protocol.** There are no hardcoded I2C addresses. All addresses are assigned dynamically at boot by the Conductor.

### Staging address

All modules boot with their I2C peripheral **disabled**. After a unique backoff delay, the module enables I2C at the shared staging address **`0x7F`**.

### Backoff delay

Each module calculates a unique delay using an **FNV‑1a hash** of its 64‑bit hardware UID:

```c
uint32_t fnv_backoff(uint32_t seed) {
    volatile uint8_t *uid = (volatile uint8_t*)0x1FFFF7E8;  // CH32V003 UID
    uint32_t h = seed ^ 2166136261UL;
    for (uint8_t i = 0; i < 8; i++) {
        h ^= uid[i];
        h *= 16777619UL;
    }
    return (h % 2500) + 300;  // 300–2799 ms
}
```

This ensures even chips from the same manufacturing batch (with near‑identical UIDs) receive well‑separated backoff times. The formula works reliably for up to ~20 modules on the same bus.

### Module state machine

```
BOOT_WAITING  ──[backoff expires]──►  ENUM_READY  ──[address assigned]──►  ASSIGNED
    ▲                                      │
    └──────[200 ms timeout, re-backoff]────┘
```

- **BOOT_WAITING**: I2C peripheral off. Counting down backoff timer.
- **ENUM_READY**: I2C enabled at `0x7F`. Waiting for Conductor.
- **ASSIGNED**: I2C at runtime address. Normal operation.

If a module is in `ENUM_READY` for more than **200 ms** without being assigned, it assumes a collision occurred and re-backs off using the current timestamp as an additional seed. This resolves any edge-case collisions automatically.

### Enumeration byte protocol

**Step 1 — Conductor reads 10 bytes from `0x7F`:**

| Bytes | Content |
|-------|---------|
| 0–7 | 64‑bit hardware UID (little‑endian, from `0x1FFFF7E8`) |
| 8 | Module type code (see table below) |
| 9 | CRC8 of bytes 0–8 (polynomial `0x07`) |

**Step 2 — Conductor writes 2 bytes to `0x7F` to assign address:**

| Byte | Value |
|------|-------|
| 0 | `0x1D` (ASSIGN register) |
| 1 | New runtime address (from pool `0x08–0x77`) |

The module switches immediately to the new address and enters `ASSIGNED` state.

**Step 3 — Repeat** until `0x7F` produces no response for 500 ms.

### Conductor Python implementation

```python
from noknok import Conductor

c = Conductor()     # GP8=SDA, GP9=SCL
c.enumerate()       # discovers all modules, assigns addresses

c.buzzer[0].play(440, 500)   # first buzzer
c.buzzer[1].play(880, 500)   # second buzzer (if present)
```

---

## 4. Module Type Codes

Every module reports its type in the enumeration response (byte 8). The Conductor uses this to instantiate the correct Python driver class.

| Code | Module | Python class |
|------|--------|--------------|
| `0x01` | Buzzer | `NoknokBuzzer` |
| `0x02` | Rotary Encoder (Knob) | `NoknokKnob` *(planned)* |
| `0x03` | Keyboard Switch + RGB LED | `NoknokKeyboard` *(planned)* |
| `0x04` | USB‑C LED Strip | `NoknokLEDStrip` *(planned)* |

---

## 5. Standard Register Map

All modules share a common register header (addresses `0x00–0x1F`). Module‑specific registers begin at `0x20`.

| Address | Name | R/W | Description |
|---------|------|-----|-------------|
| `0x00–0x07` | `UID[0..7]` | R | 64‑bit hardware UID (little‑endian) |
| `0x08` | `MODULE_TYPE` | R | Module type code (see table above) |
| `0x09` | `FW_VERSION` | R | Firmware version |
| `0x10` | `STATUS` | R | Bit 0: READY, Bit 1: BUSY, Bit 2: BOOTLOADER |
| `0x11` | `ERROR` | R/W | Last error code; write `0x00` to clear |
| `0x16` | `BOOT_CMD` | W | Write `0xB0` to enter OTA bootloader |
| `0x1D` | `ASSIGN_ADDR` | W | Write new I2C address during enumeration |
| `0x20+` | *(module‑specific)* | — | All module functionality lives here |

**Note:** Status reads during `ENUM_READY` state (at `0x7F`) return the 10‑byte UID response, not the standard status byte.

---

## 6. Module‑Specific Registers (`0x20+`)

Each module defines its own command and data registers starting at `0x20`. These must be documented in the module's own README.

**Example — Buzzer module:**

| Address | Command | Bytes | Description |
|---------|---------|-------|-------------|
| `0x20` write | `0x00` | 1 | STOP — silence immediately |
| `0x20` write | `0x01` + fH + fL + dur + vol | 5 | PLAY NOTE — freq (Hz, big‑endian), duration (×100 ms), volume (0–100) |
| `0x20` write | `0x02` + id | 2 | PLAY TUNE — play preloaded tune (1–5) |
| `0x20` read | — | 1 | STATUS — `0x01` playing, `0x00` idle |

---

## 7. Firmware Conventions

- **Non-blocking**: Module firmware must never block on `Delay_Ms()` during normal operation. Use hardware timers (TIM2 as 1 ms tick) for all timing.
- **Fire and forget**: The Conductor sends a command and returns immediately. The module handles all timing internally.
- **Interrupt on new command**: Any new command immediately overrides what is currently playing/running.
- **Startup confirmation**: Every module plays or signals a startup sequence on boot (e.g. a chime) to confirm it is alive. This runs during the backoff period before I2C is enabled.
- **CRC on UID response**: The 10‑byte enumeration response must always include a valid CRC8 byte.

---

## 8. State Persistence

After enumeration, the Conductor saves module assignments to `noknok_state.json` on the Pico. On the next run, it pings each saved address first. Modules that respond are restored immediately without re-running the `0x7F` enumeration cycle.

```
First run:   enumerate() → finds 4 modules on 0x7F → saves noknok_state.json
Second run:  enumerate() → pings 0x08–0x0B → all respond → restored instantly
Power cycle: enumerate() → modules gone from 0x08–0x0B → full 0x7F scan again
```

> **Filesystem write access required.** The Pico filesystem must be writable from code for `noknok_state.json` and `noknok_roles.json` to be saved. See the [CircuitPython filesystem docs](https://docs.circuitpython.org/en/latest/docs/library/storage.html).

---

## 9. Summary

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
| Max modules per bus | ~20 (total boot time ≈ 3–4 s) |
| Hardcoded addresses | **Never** |

---

## 10. Related Documentation

- [Electrical Guidelines](/electrical/readme.md)
- [Mechanical Guidelines](/mechanical/readme.md)

---

## 11. Safety & Responsibility Disclaimer

The overall guidelines described in this repository are intended to support reproducible, modular, and maker‑friendly designs within the noknok ecosystem. They do **not** replace professional engineering judgment.

By using these guidelines, you acknowledge that:

- You are responsible for ensuring **electrical safety**, **mechanical safety**, and **structural integrity** of your designs.
- You must verify that your modules, housings, and assemblies comply with relevant **local regulations**, **material limitations**, and **use‑case requirements**.
- noknok and its contributors are not liable for damages resulting from improper design, manufacturing, or use of modules or housings.

These guidelines are provided **as‑is** to support creativity and reproducibility in the community.
