# Module Discovery & Enumeration

How the Conductor finds every module on the I²C bus and gives each one a unique address.

---

## The Problem — Multiple identical modules on the same bus

Without enumeration, every noknok Buzzer would have the same hardcoded I²C address (e.g. `0x45`). Plug in three buzzers and all three respond at once — the wires fight each other and the Pico reads garbage. No module is individually addressable.

**The solution:** every module boots with I²C off. Modules join the bus one at a time using a UID-derived backoff timer. The Conductor assigns each one a unique runtime address before the next module appears.

---

## How it works — The backoff timeline

At power-on, every module independently calculates a unique wait time from its hardware UID. They stagger their arrival on the bus naturally:

```
Time →    0ms        500ms      1000ms     1500ms     2000ms     2500ms
          │          │          │          │          │          │
Module A  ░░░░░▓▓──────────────────────────────────────────────────────
          (320ms)  ↑ assigned → 0x08
                   
Module B  ░░░░░░░░░░░░░░░▓▓───────────────────────────────────────────
          (870ms)         ↑ assigned → 0x09

Module C  ░░░░░░░░░░░░░░░░░░░░░░░░░░░▓▓──────────────────────────────
          (1540ms)                    ↑ assigned → 0x0A

Module D  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▓▓──────────────────────
          (2100ms)                             ↑ assigned → 0x0B

Conductor ···· polling 0x7F every 20 ms throughout ····················

░ = waiting (I²C off)   ▓ = active on 0x7F   ─ = assigned, normal operation
```

For 4 modules, total discovery time ≈ 3 s. Scales reliably to ~20 modules.

---

## Backoff formula — FNV-1a hash of hardware UID

```c
static uint32_t fnv_hash(uint32_t h)
{
    volatile uint8_t *uid = (volatile uint8_t*)0x1FFFF7E8;  // CH32V003 UID
    for (uint8_t i = 0; i < 8; i++) {
        h ^= uid[i];
        h *= 16777619UL;
    }
    return h;
}

// Initial backoff: pass the FNV-1a offset basis as starting value
backoff_ms = (fnv_hash(2166136261UL) % 2500) + 300;  // range: 300–2799 ms
```

> **Critical:** always pass `2166136261UL` (the FNV‑1a offset basis) directly — do **not** XOR it with any seed first. XORing collapses same-batch chips (near-identical UIDs) to near-identical backoff times, causing collisions.

The hash spreads even chips from the same manufacturing batch (which have sequential UIDs) reliably across the full 300–2799 ms range.

**Re-backoff on collision:** if a module sits at `0x7F` for more than 200 ms without being assigned, it assumes a collision and re-backs off using the current millisecond timestamp as seed, with a shorter range (50–549 ms). This resolves any edge-case collision automatically without any intervention.

---

## Module state machine

Every I²C module implements exactly these four states:

```
┌──────────────────┐                      ┌──────────────────┐
│  BOOT_WAITING    │                      │   ENUM_READY     │
│                  │  backoff expires     │                  │
│  I²C off         │ ──────────────────► │  I²C at 0x7F     │
│  Backoff timer   │                      │  Sends UID on    │
│  counting down   │ ◄────────────────── │  read; accepts   │
│  Invisible to    │  200 ms timeout,     │  address on      │
│  the bus         │  re-backoff          │  write           │
└──────────────────┘                      └────────┬─────────┘
                                                   │
                                    address written by Conductor
                                                   │
                                          ┌────────▼─────────┐
                                          │   ASSIGNING      │
                                          │                  │
                                          │  New address     │
                                          │  received in ISR │
                                          │  Switch pending  │
                                          │  in main loop    │
                                          └────────┬─────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │   ASSIGNED       │
                                          │                  │
                                          │  I²C at runtime  │
                                          │  address         │
                                          │  Normal module   │
                                          │  operation       │
                                          └──────────────────┘
```

> **Why ASSIGNING is a separate state:** The address switch must not happen inside the I²C ISR (which is still mid-transaction). The ISR sets `new_addr` and flags `DEV_ASSIGNING`. The main loop performs the actual peripheral reconfiguration on the next cycle, safely outside interrupt context.

---

## Byte-level protocol

### Step 1 — Conductor reads 10 bytes from `0x7F`

| Bytes | Content |
|-------|---------|
| 0–7 | 64‑bit hardware UID, little‑endian (from `0x1FFFF7E8` on CH32V003) |
| 8 | Module type code (see [Module Type Codes](#module-type-codes)) |
| 9 | CRC8 of bytes 0–8 (polynomial `0x07`, init `0x00`) |

The Conductor verifies the CRC. A mismatch means two modules activated simultaneously — it waits 50 ms and retries.

### Step 2 — Conductor assigns a runtime address

Conductor writes 2 bytes to `0x7F`:

| Byte | Value |
|------|-------|
| 0 | `0x1D` — ASSIGN register |
| 1 | New address (from pool `0x08–0x77`) |

The module switches to the new address and enters `ASSIGNED` state.

### Step 3 — Repeat

Conductor polls `0x7F` every 20 ms. Stops after **3000 ms** of no response.

> **Why 3000 ms?** The maximum backoff is 2799 ms. Waiting 3000 ms ensures even the slowest module is never missed — including when a saved state is restored and new modules are added simultaneously.

---

## Module type codes

| Code | Module name | Python class | Status |
|------|-------------|--------------|--------|
| `0x01` | noknokbuzzer | `NoknokBuzzer` | ✅ complete |
| `0x02` | noknokknob | `NoknokKnob` | ✅ complete |
| `0x03` | noknokledbutton | `NoknokLedButton` | ✅ complete |
| `0x04` | noknok LEDs (USB) | `NoknokLEDs` | ✅ complete — USB modules use a different discovery scheme, see [USB Module Discovery & Identity](#usb-module-discovery--identity) |

---

## CRC8 implementation

Both firmware (C) and Conductor (Python) use the same CRC8:

**C (firmware):**
```c
static uint8_t crc8(const uint8_t *data, uint8_t len)
{
    uint8_t crc = 0x00;
    for (uint8_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t j = 0; j < 8; j++)
            crc = (crc & 0x80) ? (crc << 1) ^ 0x07 : (crc << 1);
    }
    return crc;
}
```

**Python (Conductor):**
```python
def _crc8(data):
    crc = 0x00
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc
```

---

## State persistence — fast restore on reboot

After enumeration, the Conductor saves module assignments to `noknok_state.json` on the Pico. On the next boot, it pings each saved address first. Modules that respond are restored immediately — no need to wait through the full 3 s backoff cycle.

```
First boot:   enumerate() → waits up to 3 s → finds all modules → saves state
Second boot:  enumerate() → pings saved addresses instantly → all respond → done
New module:   enumerate() → pings saved → all respond → continues polling 0x7F
              → finds new module → assigns it → saves updated state
```

> **Filesystem write access required.** The Pico's CIRCUITPY filesystem must be writable from code for `noknok_state.json` to be saved. See the [CircuitPython filesystem docs](https://docs.circuitpython.org/en/latest/docs/library/storage.html).

---

## Role system: stable names across reboots

Discovery order can vary between boots, so the role system maps human-readable names
to module UIDs: your code always refers to the same physical module regardless of order.

See **[Role Assignment](roles.md)** for the full process, the `noknok_roles.json`
format, and the Conductor API.

---

## Conductor Python implementation

Full implementation lives in [`brain-Pico/software/noknok.py`](https://github.com/buildwithnoknok/brain-Pico/tree/main/software).

```python
from noknok import Conductor

c = Conductor()       # GP8 = SDA, GP9 = SCL, 100 kHz
c.enumerate()         # discovers all modules, assigns addresses (~3 s)

# Access by type + index (discovery order):
c.buzzer[0].play(440, 500)
c.buzzer[1].tune(c.buzzer[1].NOKIA)
c.knob[0].read()
c.ledbutton[0].set_color(0, 255, 0)

# Access by UID (deterministic, survives reorder):
c.by_uid("e290...").play(440, 200)
```

---

## FAQ

**Are addresses permanent?**
No — runtime only. Lost on power cycle. The Conductor re-enumerates (or fast-restores from JSON) on every boot. No EEPROM writes, no address conflicts between different products.

**What if two timers collide?**
The Conductor sees a CRC mismatch and retries after 50 ms. Meanwhile both modules time out after 200 ms and re-back off with a different seed. Resolves automatically within one extra cycle.

**How many modules can be on one bus?**
~20 reliably. Average gap between backoffs ≈ 125 ms. Total boot time ≈ 3–4 s. I²C pull-up loading becomes the practical limit before the backoff algorithm does.

**Does the Conductor need to know module types in advance?**
No. The module type code in byte 8 tells the Conductor which Python driver class to instantiate. New module types can be added without changing the Conductor's core enumeration logic.

---

## USB Module Discovery & Identity

USB modules (e.g. **noknok LEDs**) attach to the Conductor as **USB devices on a host port** — the Pico acts as USB host (PIO-USB on a consecutive GPIO pair, typically with the modules behind a **powered** hub such as the DataHub). They do **not** use the I²C backoff/address-assignment scheme above: USB addressing is handled by the host stack. Discovery instead relies on each module carrying a **globally-unique USB serial number** so identical modules can be told apart — the USB counterpart of the I²C UID.

### The identity triple — symmetric with I²C

I²C enumeration yields **UID + type + version**. USB modules expose the same triple from native USB sources:

| Property | I²C source | USB source |
|----------|------------|------------|
| **Type** | `MODULE_TYPE` byte in the `0x7F` response | **PID** — one Product ID per module type |
| **Instance ID** | 8-byte hardware UID | **iSerialNumber** — the MCU's hardware unique ID |
| **Version** | `GET_VERSION` (`0xB1`) | `GET_VERSION` (`0xB1`) — identical command |

So a USB module's identity is idiomatic USB: **VID = noknok, PID = module type, serial = unique instance.** (VID/PID assignment is being finalised; development units use the pid.codes prototype VID `0x1209`.)

### Unique serial number

Every USB module derives its serial from the MCU's hardware unique ID, so it is **stable across power cycles** and **unique per physical unit**:

- **Source:** the 96-bit chip UID (CH32V203: ESIG `UNIID` at `0x1FFFF7E8`, three 32-bit words).
- **Format:** 24-character uppercase hex string, no separators (e.g. `A1B2C3D4E5F6A1B2C3D4E5F6`), written into the USB `iSerialNumber` string descriptor (UTF-16LE) at boot.

The Conductor and the role system treat this serial exactly as they treat an I²C UID — a unique hex-string identity.

### Discovery flow

```
1. Conductor opens the USB host port (PIO-USB) and scans the bus.
2. For each device whose VID = noknok:
     - read iSerialNumber    -> instance ID  (which physical module)
     - read PID              -> module type  (which driver class)
     - send GET_VERSION 0xB1 -> firmware version
3. Build the registry { serial: (type, version, handle) }.
```

No address assignment, no backoff, no collision handling — the host enumerates each device automatically and the serial provides the stable identity. Enumeration is **sequential** (~3 s per module as each attaches through the hub), comparable to the I²C timeline.

> **Power is mandatory.** A USB module behind an *unpowered* hub enumerates its short descriptors but browns out on larger transfers. Hubs in a product must be externally powered (the DataHub is, by design).

### State & roles

Roles map **role → serial**, exactly as I²C maps **role → UID**. Because both identities are unique strings, the role map, the persisted registry, and the product manifest handle I²C and USB modules **uniformly**. See [Role Assignment](roles.md).

> **Output-module role assignment.** Input modules (knob, button) are role-assigned by *interaction* — the customer touches the one to assign. Output-only USB modules (e.g. the LED ring) are assigned by *cue-and-confirm*: the Conductor lights each module in turn and the customer confirms which physical one responded.

---

## Related documentation

- [Software Guidelines](readme.md) — toolchain, languages, firmware conventions
- [Electrical Guidelines](../electrical/readme.md) — I²C connector standard, pull-ups, addressing rules