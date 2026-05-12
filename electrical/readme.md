# Electrical Guidelines

These guidelines define how noknok modules communicate, receive power, expose interfaces, and integrate into the broader ecosystem. They ensure compatibility, reproducibility, and long‑term sustainability across all modules.

---

## 1. Connector Standards

### **Stemma QT / Qwiic (I2C) / JST-SH**
Use for:
- Low‑power digital peripherals  
- Sensors, small displays, input devices  
- Modules requiring only I2C + power  

Characteristics:
- 4‑pin JST‑SH (1.0 mm pitch)  
- Hot‑swappable in most cases  
- Supports daisy‑chaining
- Follows the standard pinout as defined by **[Sparkfun: Qwiic](https://www.sparkfun.com/qwiic)** or **[Adafruit: Stemma QT](https://learn.adafruit.com/introducing-adafruit-stemma-qt/what-is-stemma-qt)**  

### **USB‑C**
Use for:
- High‑power modules  
- High‑bandwidth communication  
- Modules exposing USB devices (audio, storage, connectivity, etc.)

Characteristics:
- Reversible, robust  
- Supports power + data  
- Mandatory for modules requiring > 500 mA or > I2C bandwidth  

---

## 2. Power Rules

### **Single‑Power‑Feed Philosophy**
All modules must be powered from a **single upstream source** (typically the Conductor or a power‑distribution module).

Rules:
- No module may back‑feed power upstream  
- No module may generate a second independent power rail unless isolated  
- Power consumption must be documented in the module’s spec  
- USB‑C modules must declare their maximum draw  

### **Voltage Levels**
- Standard system voltage: **3.3 V**  
- USB‑C modules may use USB-PD **5 V**, **9 V**, **12 V** with up to **3 Amps** if used with the noknok USB Power module or noknok USB Hub module 

---

## 3. I2C Standardization

### **Pinout Convention (Stemma QT / Qwiic)**
All I2C modules must follow standardized pin order as defined by **[Sparkfun: Qwiic](https://www.sparkfun.com/qwiic)** or **[Adafruit: Stemma QT](https://learn.adafruit.com/introducing-adafruit-stemma-qt/what-is-stemma-qt)**:  

1. **GND**  
2. **VCC (3.3 V)**  
3. **SDA**  
4. **SCL**

### **Pull‑Ups**
- **TO BE REFINED!!!!!**
- Currently all modules have **10 kΩ** on SDA and SCL.
- There are no pull-ups on the host
- I believe we should remove pull-ups from modules and add **4.7 kΩ** to the host   

### **Cable Length**
- Recommended maximum cable length per I2C connector (branch): **100 cm**  
- Total bus length (sum of all branches) should stay within **2–3 meters** for reliable operation at 100 kHz.
- For longer distances or electrically noisy environments, prefer **USB‑C** instead of I2C.

---

## 4. I2C Addressing Rules

In the noknok ecosystem, I2C addresses are **not fixed per module**.  
Instead, the Conductor assigns addresses dynamically during a **discovery and enumeration process**.

### **Dynamic Addressing Model**
- All modules boot at a **shared default address** (e.g., 0x7F).
- Each module exposes a **unique ID** stored in its MCU (derived from MCU UID or generated on first boot).
- During startup, the Conductor performs a **discovery scan**:
  - Modules respond one‑by‑one using a collision‑avoidance backoff.
  - Each module reports its unique ID, module type, and capabilities.
  - The Conductor assigns a **runtime I2C address** (e.g., 0x20, 0x21, 0x22…).
- Modules switch to their assigned address and remain there until reset.

This ensures:
- No address conflicts  
- Unlimited identical modules on the same bus  
- Stable identity via unique IDs  
- Plug‑and‑play behavior  

### **Module Requirements**
- Each module must:
  - Contain an MCU capable of changing its I2C address at runtime.
  - Expose a **unique ID** (96–128 bits).
  - Respond to enumeration commands at the default address.
  - Accept a new I2C address assigned by the Conductor.

### **Best Practices**
- Document the module’s **default enumeration address** (e.g., 0x7F).
- Document the module’s **unique ID format**.
- Avoid using fixed hardware addresses unless required by a chip.
- If a module contains a fixed‑address peripheral internally, the MCU must:
  - Proxy it behind the module’s virtual I2C device, or  
  - Handle communication internally and expose a clean API.

### **Legacy Compatibility**
If a module uses a fixed hardware address (rare cases):
- Document the address clearly.
- Ensure the MCU proxies the device so the module still appears as a **single virtual device** to the Conductor.

---

## 5. PCB Design Guidelines

### **KiCad as the Standard Tool**
All modules must be designed in **KiCad** to ensure:
- long term Open‑source reproducibility  
- Consistent library usage  
- Easy community contributions  

### **General PCB Rules**
- Use castellated edges for module‑to‑module solderability  
- Keep connectors on the **top side** whenever possible  
- Maintain consistent mounting hole positions  
- Use clear silkscreen labeling for:
  - Pin names  
  - Orientation  
  - Module name  
  - Version number  

### **Trace & Power Guidelines**
- Follow IPC‑2221 for trace width  
- For power traces > 500 mA, use ≥ 0.5 mm width  
- Place decoupling capacitors close to ICs  

---

## 6. Flashing Interface (MCU Modules)

All MCU‑based modules must expose a **5‑pad flashing interface** using castellated pads.

### **Pin Order (top‑to‑bottom or left‑to‑right):**
1. **not connected** (for module orientation lock)
2. **GND**  
3. **SWIO**  
4. **RST**  
5. **VCC (3.3 V)**  

### Requirements:
- Pads must be 2.54 mm pitch  
- Must be accessible from the board edge  
- Must match the standard noknok flashing jig  

---

## 7. Summary of Electrical Philosophy

- **Consistency** enables reproducibility  
- **Modularity** enables sustainability  
- **Standardization** enables community participation  
- **Abstraction** enables rapid innovation  

---

## 8. Safety & Responsibility Disclaimer

The electrical guidelines described in this document are intended to support reproducible, modular, and maker‑friendly designs within the noknok ecosystem. They do **not** replace professional engineering judgment.

By using these guidelines, you acknowledge that:

- You are responsible for ensuring **electrical safety**, **mechanical safety**, and **structural integrity** of your designs.  
- You must verify that your modules, housings, and assemblies comply with relevant **local regulations**, **material limitations**, and **use‑case requirements**.  
- noknok and its contributors are not liable for damages resulting from improper design, manufacturing, or use of modules or housings.

These guidelines are provided **as‑is** to support creativity and reproducibility in the community.


