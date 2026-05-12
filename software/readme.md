# Firmware Guidelines

THESE GUIDELINES ARE STILL UNDER REFINEMENT. PLEASE DO NOT TAKE THEM FOR GRANTED.

The firmware guidelines define how code is written for both sides of the noknok ecosystem:

- The **Conductor** (central MCU, e.g., Raspberry Pi Pico)  
- The **Musicians** (module MCUs, typically CH32V003 / CH32V203)

These rules ensure consistent behavior, predictable communication, and long‑term maintainability across all modules.

---

## 1. Primary Languages

### **Python for the central MCU / the Conductor**
The Conductor runs the main application logic, orchestration routines, and module coordination.

- Python is the **primary language** for all Conductor‑side firmware.  
- Recommended environment: **MicroPython** or **CircuitPython**.  
- Python handles:
  - Module discovery  
  - Dynamic I2C address assignment  
  - High‑level orchestration  
  - Application logic  

### **C for Module MCUs**
Each module contains its own MCU and runs firmware written in **C**.

- C is the **primary language** for all module‑side firmware.  
- Modules expose a **virtual I2C device** with:
  - A unique ID  
  - A capability descriptor  
  - A runtime‑assigned I2C address  
  - A register map for data exchange  

---

## 2. Recommended Toolchains

### **Conductor (Python)**
- MicroPython or CircuitPython toolchain  
- Thonny IDE

### **Module MCUs (C)**
- **GCC** (ARM‑GCC or RISC‑V GCC depending on MCU)  
- **SDCC** (for 8051 MCUs if needed)  

---

## 3. I2C Register Map Design

Each module exposes a **virtual I2C device** with a standardized register layout.

### **Required Registers**
- **0x00–0x07** — Unique ID (64‑bit)  
- **0x08** — Module type  
- **0x09** — Firmware version  
- **0x0A** — Capability flags  
- **0x0B** — Status flags  

### **Runtime‑Assigned Address**
- All modules boot at a shared default address (e.g., 0x7F).  
- The Conductor assigns a unique address during discovery.  
- The module stores the assigned address until reset.  

### **Module‑Specific Registers**
- Begin at **0x20**  
- Must be documented in the module’s README  
- Should follow a simple pattern:
  - Read‑only data  
  - Read/write configuration  
  - Command registers  

### **Best Practices**
- Keep register maps small and predictable.  
- Use little‑endian encoding.  
- Avoid multi‑byte writes unless necessary.  
- Document every register clearly.  

---

## 4. Summary

- Python is the primary language for the Conductor.  
- C is the primary language for module MCUs.  
- GCC and SDCC are the recommended toolchains.  
- Code structure should follow consistent folder and file conventions.  
- Modules expose a virtual I2C device with a standardized register map.  
- Dynamic address assignment ensures conflict‑free operation.

---

## 5. Related Documentation

- [Electrical Guidelines](/electrical/readme.md)  
- [Mechanical PCB and 3D printing Guidelines](mechanical/readme.md)  

---

## 6. Safety & Responsibility Disclaimer

The overall guidelines described in this repository are intended to support reproducible, modular, and maker‑friendly designs within the noknok ecosystem. They do **not** replace professional engineering judgment.

By using these guidelines, you acknowledge that:

- You are responsible for ensuring **electrical safety**, **mechanical safety**, and **structural integrity** of your designs.  
- You must verify that your modules, housings, and assemblies comply with relevant **local regulations**, **material limitations**, and **use‑case requirements**.  
- noknok and its contributors are not liable for damages resulting from improper design, manufacturing, or use of modules or housings.

These guidelines are provided **as‑is** to support creativity and reproducibility in the community.
