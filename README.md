# noknok Ecosystem Guidelines

This repository defines the **technical standards**, **mechanical rules**, **electrical conventions**, and **firmware guidelines** for building modules, kits, and housings within the **noknok modular hardware ecosystem**.

It is the authoritative reference for anyone creating:

- Hardware modules  
- 3D‑printed housings  
- Firmware for microcontrollers  
- Central‑MCU applications (e.g., Raspberry Pi Pico)  

---

# 📡System Architecture

The noknok ecosystem follows the **Conductor–Musicians** model:

- The **Conductor** is the central MCU (e.g., Raspberry Pi Pico)  
- The **Musicians** are the modules (I²C, USB, audio, sensors, etc.)  
- Communication is standardized through **I²C**, **USB**, and **defined power rules**

See:  
- [System Architecture](overview/architecture.md)  
- [Conductor–Musician Model](overview/conductor-musician-model.md)

---

# 🧩Electrical & PCB Guidelines

Standards for designing modules that plug into the ecosystem.

- [Connector Standards](electrical/connectors.md)  
- [Power Rules](electrical/power.md)  
- [I²C Standardization](electrical/i2c-standard.md)  
- [USB Module Standard](electrical/usb-standard.md)  
- [PCB Design Guidelines](electrical/pcb-design.md)  
- [Flashing Interface (Castellated Pads)](electrical/flashing-interface.md)

Topics include:

- When to use **Stemma QT / Qwiic / JST‑SH**  
- Single‑power‑feed rules  
- Pinout conventions  
- KiCad as the default PCB design tool  
- 4‑pad flashing interface for MCUs  
- I²C addressing rules and best practices  

---

# 🛠️Mechanical & 3D Guidelines

Standards for module dimensions, mounting, and 3D‑printed housings.

- [Module Dimensions](mechanical/module-dimensions.md)  
- [Mounting Holes](mechanical/mounting-holes.md)  
- [3D Printing Guidelines](mechanical/3d-printing-guidelines.md)  
- [Tolerances & Clearances](mechanical/tolerances.md)

Topics include:

- Standard PCB sizes  
- Mounting hole positions  
- Recommended wall thickness  
- Clearance for connectors  
- 3D printing material recommendations  

---

# 💻Firmware & Programming Guidelines

Guidelines for writing firmware for modules and applications for the central MCU.

- [Python on Raspberry Pi Pico](firmware/pico-python-guidelines.md)  
- [C on Microcontrollers](firmware/mcu-c-guidelines.md)  
- [Compiler Toolchains (GCC, SDCC)](firmware/compiler-toolchains.md)  
- [Firmware Update Process](firmware/firmware-update-process.md)

Topics include:

- Python as the primary language for the Conductor  
- C as the primary language for module MCUs  
- Recommended toolchains  
- Code structure conventions  
- I²C register map design  

---

# 📄License

All documentation in this repository is open‑source and may be used for creating compatible modules and housings.

