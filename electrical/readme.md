# Electrical Guidelines

These guidelines define how noknok modules communicate, receive power, expose interfaces, and integrate into the broader ecosystem. They ensure compatibility, reproducibility, and long-term sustainability across all modules.

---

## 1. Connector Standards

### **Stemma QT / Qwiic (I2C) / JST-SH**
Use for:
- Low-power digital peripherals  
- Sensors, small displays, input devices  
- Modules requiring only I2C + power  

Characteristics:
- 4-pin JST-SH (1.0 mm pitch)  
- Hot-swappable in most cases  
- Supports daisy-chaining
- Follows the standard pinout as defined by **[Sparkfun: Qwiic](https://www.sparkfun.com/qwiic)** or **[Adafruit: Stemma QT](https://learn.adafruit.com/introducing-adafruit-stemma-qt/what-is-stemma-qt)**  

### **USB-C**
Use for:
- High-power modules  
- High-bandwidth communication  
- Modules exposing USB devices (audio, storage, connectivity, etc.)

Characteristics:
- Reversible, robust  
- Supports power + data  
- Mandatory for modules requiring > 500 mA or > I2C bandwidth  

---

## 2. Power Rules

### **Single-Power-Feed Philosophy**
All modules must be powered from a **single upstream source** (typically the Conductor or a power-distribution module).

Rules:
- No module may back-feed power upstream  
- No module may generate a second independent power rail unless isolated  
- Power consumption must be documented in the module's spec  
- USB-C modules must declare their maximum draw  

### **Voltage Levels**
- Standard system voltage: **3.3 V**  
- USB-C modules may use USB-PD **5 V**, **9 V**, **12 V** with up to **3 Amps** if used with the noknok USB Power module or noknok USB Hub module 

### **Daisy-Chain Power Budget (I²C 3.3 V rail)**

I²C modules draw power from the 3.3 V pin of the JST-SH connector. Two limits cap how many can be daisy-chained (independent of the I²C bus-capacitance limit in §3):

- **Host 3.3 V source budget** — the Pico's onboard 3V3 supplies ~**300 mA** usable; a **dedicated 3.3 V regulator** on the host/PicoHub (fed from the PowerHub 5 V) gives ~**800 mA–1 A**.
- **Voltage drop** — in a daisy chain the **first cable link carries the sum of all downstream current**, so keep it short/thick to avoid browning out far modules (the CH32V003 is brownout-sensitive).

Approximate per-module current (**measure to confirm**):

| Module | Idle / typical | Peak |
| --- | --- | --- |
| Knob | ~3–7 mA | ~7 mA |
| Buzzer | ~3–7 mA | ~30–70 mA while sounding (brief) |
| LED Button | ~5–10 mA (LED dim/off) | **~60–100 mA at full-white** (RGB via the 4.3 V boost) |
| Status LED (every module) | +~0.6 mA | — |

Realistic daisy-chain count:

- **Knobs / buzzers / dim LED Buttons:** power is not the limit — the I²C bus capacitance caps you first at **~15–20** (see the [Pull-up Resistor Strategy ADR](https://noknokdev.atlassian.net/wiki/spaces/SD/pages/82280449)).
- **Several LED Buttons at full brightness:** **power-limited** — ~**3–6** on a Pico-3V3 host (~300 mA), ~**10–12** with a dedicated ~1 A regulator.

Guidance:

- For products with **several LED Buttons**, give the host/PicoHub a **dedicated 3.3 V regulator** (from the PowerHub) rather than leaning on the Pico's onboard 3V3.
- Keep the **first cable link short** when chain current is high.
- Provide a firmware **global brightness / current cap** to bound the worst case.
- **Measure** actual per-module current before publishing a max-module figure.

---

## 3. I2C Standardization

### **Pinout Convention (Stemma QT / Qwiic)**
All I2C modules must follow standardized pin order as defined by **[Sparkfun: Qwiic](https://www.sparkfun.com/qwiic)** or **[Adafruit: Stemma QT](https://learn.adafruit.com/introducing-adafruit-stemma-qt/what-is-stemma-qt)**:  

1. **GND**  
2. **VCC (3.3 V)**  
3. **SDA**  
4. **SCL**

### **Pull-Ups**

> **Pull-up strategy (decided — Option C):** noknok modules carry **no** I²C pull-ups; the **host (Conductor) provides a single 3.3 kΩ** pair on SDA/SCL. One pull-up location only → the bus stays deterministic regardless of module count. For a third-party host without pull-ups, use the noknok pull-up PCB ([DEV-9](https://noknokdev.atlassian.net/browse/DEV-9)). Rationale, module-count limits, and scaling options (LTC4311 accelerator / P82B96 buffer / TCA9548A mux) are in the [ADR: I²C Pull-up Resistor Strategy](https://noknokdev.atlassian.net/wiki/spaces/SD/pages/82280449). (Legacy modules had 10 kΩ on-board; these are being removed in V2.)

### **Cable Length**
- Recommended maximum cable length per I2C connector (branch): **100 cm**  
- Total bus length (sum of all branches) should stay within **2–3 meters** for reliable operation at 100 kHz.
- For longer distances or electrically noisy environments, prefer **USB-C** instead of I2C.

---

## 4. I2C Addressing Rules

I2C addresses are **not fixed per module**. Every module boots at a shared staging address (`0x7F`), exposes a 64-bit unique ID, and the Conductor assigns each a runtime address (`0x08–0x77`) during discovery — so identical modules never conflict and the bus is plug-and-play.

The full discovery and address-assignment process (collision-avoidance backoff, CRC, state machine, and the module-side requirements) is specified in **[Software → Enumeration Protocol](../software/enumeration.md)**. Every I2C module must implement it.

---
## 5. PCB Design Guidelines

### **KiCad as the Standard Tool**
All modules must be designed in **KiCad** to ensure:
- Long-term open-source reproducibility  
- Consistent library usage  
- Easy community contributions  

### **noknok KiCad Library**
Shared custom symbols and footprints live in this repo:
- Symbols: `electrical/noknok.kicad_sym`
- Footprints: `electrical/noknok.pretty/`

Add both to KiCad with the library nickname **`noknok`**. Current parts:
- `noknok_FlashPads_I2C-module` (symbol) + `noknok_FlashPads_I2C-module_1x3_M2.5` (footprint) — the flashing interface for CH32V003 I2C modules, see §6.
- `noknok_FlashPads_USB-module` (symbol) + `noknok_FlashPads_USB-module_1x4_M2.5` (footprint) — the flashing interface for CH32V203 USB modules (2-wire SWD), see §6. Shares the I2C part's jig geometry.
- `noknok_MountingHole` (symbol) + `noknok_MountingHole_2.5mm_M2.5` (footprint) — the standard mounting hole, see [Mechanical guidelines](../mechanical/readme.md).
- `noknok_UART_debug_1x3_pogo` — 3 pogo pads (GND / TX / RX) for UART bring-up debugging.
- Display panels: `noknok_ER-TFT1.42-1`, `noknok_ER-TFT020-7`, `noknok_ER-OLED0.96-1B` (+ matching footprints where the panel is soldered).

### **ECAD Tools**
Read-only helper scripts for reviewing a design live in **[`electrical/tools/`](tools/readme.md)**.

- **`kicad_netlist.ps1`** — reconstructs the full netlist from a `.kicad_sch` and lists every net with its member pins. Flags **single-pin nets** (almost always a missed connection) and pins sitting on no wire. Handy as a review pass before sending a board to fab, or to confirm a rework landed where you intended. It does **not** replace KiCad's ERC — see the tool readme for its limits.

### **General PCB Rules**
- Module interconnect is via the **JST-SH (Qwiic / Stemma QT) connectors**. **Castellated edges are no longer used** — both the castellated I2C edge and the castellated flashing edge proved too unreliable to contact/clamp and have been removed.  
- Keep connectors on the **top side** whenever possible  
- Mounting holes, board sizes and fasteners follow the **[Mechanical guidelines](../mechanical/readme.md)** (M2.5, one consistent hole pattern per board class)  
- Use clear silkscreen labeling for: pin names, orientation, module name, version number  

### **Trace & Power Guidelines**
- Follow IPC-2221 for trace width  
- For power traces > 500 mA, use ≥ 0.5 mm width  
- Place decoupling capacitors close to ICs  

---

## 6. Flashing Interface & Status LED (MCU Modules)

MCU modules are flashed with a **pogo-pin clamp onto flat SMD pads** (not castellated edges). The pads and a keyed mounting hole are provided as a ready-made part in the noknok KiCad library (§5).

### **CH32V003 I2C modules — 3-pad, single-wire SWD**
Footprint: **`noknok:noknok_FlashPads_I2C-module_1x3_M2.5`**
- 3 round Ø1.5 mm SMD pads, **2.54 mm pitch**, on the **bottom side**, copper + soldermask only (no paste), **ENIG finish** for repeated pogo contact.
- Pin order: **1 = GND, 2 = SWIO, 3 = VCC**.
- The CH32V003 uses WCH **single-wire** debug (SWIO only); reset/halt is handled in-protocol by the WCH-LinkE, so **no RST or SWCLK pad is needed**.
- Recovery of a read-protected / factory chip: `minichlink -p` over SWIO (clears RDPR + mass-erase), then flash.

### **Orientation key (the embedded mounting hole)**
The flashing footprint **embeds one of the board's two M2.5 mounting holes** (at the part origin), at a fixed offset from the pads. This:
- fixes the hole-to-pad spacing so every module is compatible with the same flashing jig, and
- **keys orientation** — the jig's locating post + the offset pad row can only seat one way. A 180° flip lands the pads on bare board, and because the pads are single-side, clamping the wrong side simply makes no contact (no reverse-power risk). A silk pin-1 triangle marks GND.

### **USB / CH32V203 modules — 4-pad, 2-wire SWD**
Footprint: **`noknok:noknok_FlashPads_USB-module_1x4_M2.5`**
- The CH32V203 uses standard **2-wire SWD: SWDIO (PA13) + SWCLK (PA14)** → 4 pads: **GND, SWDIO, VCC, SWCLK** (SWCLK added one 2.54 mm step beyond VCC).
- It reuses the **same hole-to-pad offset** as the I2C footprint, so **one pogo jig flashes both module families** — on a 3-pad I2C module the jig's unused 4th pogo just rests on bare board.
- **No RST pad, same reasoning as the I2C variant** — WCH-LinkE connects to the CH32V203 over SWDIO + SWCLK alone; reset/halt is handled in-protocol, confirmed against WCH's own SWD guidance for this chip family. A hardware NRST pad adds nothing for flashing or recovery.
- Replaces the Tag-Connect TC2030 pogo connector previously used on `module-usb-led` — first module to switch is its round V2 respin.

### **Status LED (on the SWIO / PD1 line)**
Every CH32V003 module carries a **status LED on PD1 — the SWIO line — using zero extra GPIO**:
- Wiring (active-low): `+3V3_PROT → 2.2 kΩ → LED anode; LED cathode → PD1/SWIO`.
- Parts: red 0603 LED (LCSC **C2286**) + 2.2 kΩ 0603 resistor (LCSC **C4190**). The 2.2 kΩ keeps the load on the SWD line minimal (~0.6 mA) while red stays clearly visible.
- Driven by the bootloader: **off** = app running, **slow pulse** = updating / recovering, **solid** = error.
- SWD flashing still works with the LED fitted (the WCH-LinkE halts via SWIO at connect).

---

## 7. Summary of Electrical Philosophy

- **Consistency** enables reproducibility  
- **Modularity** enables sustainability  
- **Standardization** enables community participation  
- **Abstraction** enables rapid innovation  

---

## 8. Safety & Responsibility Disclaimer

The electrical guidelines described in this document are intended to support reproducible, modular, and maker-friendly designs within the noknok ecosystem. They do **not** replace professional engineering judgment.

By using these guidelines, you acknowledge that:

- You are responsible for ensuring **electrical safety**, **mechanical safety**, and **structural integrity** of your designs.  
- You must verify that your modules, housings, and assemblies comply with relevant **local regulations**, **material limitations**, and **use-case requirements**.  
- noknok and its contributors are not liable for damages resulting from improper design, manufacturing, or use of modules or housings.

These guidelines are provided **as-is** to support creativity and reproducibility in the community.
