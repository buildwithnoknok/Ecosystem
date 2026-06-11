# noknok Ecosystem Guidelines

This repository defines the **technical standards**, **mechanical rules**, **electrical conventions**, and **firmware guidelines** for building modules, kits, and housings within the **noknok modular hardware ecosystem**.

It is the authoritative reference for anyone creating:

- Hardware modules  
- 3D‑printed housings  
- Firmware for microcontrollers  
- Central‑MCU applications (e.g., Raspberry Pi Pico)  

---

## noknok's 3 Major Goals:

- **Community creativity** — enable anyone to reproduce and share maker‑created products using 3D printing and modular electronics.
- **Sustainability** — design products that can be repaired, reused, extended and repurposed through modularity.
- **Enablement & participation** — lower barriers through standardization, open‑source tools, and revenue‑sharing for creators.

## Guiding Principles and design philosophy behind noknok's modules, kits and software:

- **Rapid reproducibility** — anyone (maker or not) is able to quickly reproduce a noknok product.
- **Local manufacturing** — all you need is a 3D printer (or CNC-machine), noknok modules, a phone, and an internet connection to create products.
- **Community driven** — products are created by and for the community.
- **Modularity first** — don't reinvent the wheel - use modules that are reusable across many projects.
- **Hardware–software abstraction** — each module has its own MCU and exposes a clean API, so the central MCU doesn’t need to know the peripheral’s electronics.
- **Sustainability** — products are built to last, easy to repair, extendable in features, and designed so modules can be reused in other creations.
- **Empowerment through openness** — standards, products, and documentation are open so the community can learn, improve, and contribute.
- **Fun** — building with noknok should feel playful, creative, and joyful — because making things should be fun.

---

## 📡 System Architecture

The noknok ecosystem is built around a clear analogy: **a classical orchestra**.

In an orchestra, the **conductor** leads, sets the rhythm, and keeps the overview.  
The **musicians** each master a single instrument, performing their part with expertise while following the conductor’s direction.

The noknok architecture works the same way:

- The **Conductor** is the central MCU (e.g., a Raspberry Pi Pico) running the main product logic, typically in Python.
- The **Musicians** are the noknok modules — each an expert in its domain.  
  A module knows how to drive a display, read a sensor, play audio, connect to 5G, or perform any specialized task.
- The **Conductor** orchestrates the **Musicians**, defining timing, behavior, and overall product flow.
- The **Musicians** handle their own complexity internally, so the Conductor doesn’t need to know their electronics.

Communication between Conductor and Musicians is standardized through:

- **Open APIs** (software abstraction)
- **Standardized connectors** such as Stemma QT / Qwiic (I2C) and USB‑C
- **Defined power rules** for predictable, safe operation

This architecture allows products to be built like orchestral compositions:  
**modular, expressive, scalable, and easy to reproduce.**

```
                         ┌──────────────────────────┐
                         │        Conductor         │
                         │  (Central MCU, e.g. Pico)│
                         │                          │
                         │  • Runs main logic       │
                         │  • Orchestrates modules  │
                         │  • Written mostly in Python
                         └─────────────┬────────────┘
                                       │
                     Standardized API  │  Standardized Connectors
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│   Musician   │              │   Musician   │              │   Musician   │
│   (Module)   │              │   (Module)   │              │   (Module)   │
│              │              │              │              │              │
│ • Sensor     │              │ • Display    │              │ • Connectivity│
│ • Audio      │              │ • Motor Ctrl │              │   (e.g. 5G)  │
│ • Actuator   │              │ • Lighting   │              │ • Storage     │
│              │              │              │              │              │
│ Own MCU +    │              │ Own MCU +    │              │ Own MCU +    │
│ Internal API │              │ Internal API │              │ Internal API │
└───────┬──────┘              └───────┬──────┘              └───────┬──────┘
        │                              │                              │
        └─────────────── I²C Bus (Stemma QT / Qwiic) ─────────────────┘
                         or USB‑C (for high‑power / high‑bandwidth)
```

---

# 🧩Electrical & PCB Guidelines

Standards for designing modules that plug into the ecosystem.

**[Check electrial guidelines](electrical/readme.md)**

Topics include:

- Connector Standards: When to use **Stemma QT / Qwiic / JST‑SH / USB-C**  
- Power Rules: Single‑power‑feed rules  
- I2C Standardization: Pinout conventions  
- PCB Design Guidelines: KiCad as the default PCB design tool  
- Flashing Interface: 4‑pad flashing interface for MCUs  
- I2C addressing rules and best practices  

---

# 🛠️Mechanical & 3D Guidelines

Standards for module dimensions, mounting, and 3D‑printed housings.

**[Check mechanical guidelines](mechanical/readme.md)**

Topics include:

- Module Dimensions: Standard PCB sizes  
- Mounting Holes: Mounting hole positions  
- 3D Printing Guidelines: Recommendation on printer settings  & material  
- Tolerances & Clearances: Clearance for connectors  

---

# 💻Firmware & Programming Guidelines

Guidelines for writing firmware for modules and applications for the central MCU.

**[Check software guidelines](software/readme.md)**

Topics include:

- Python as the primary language for the Conductor  
- C as the primary language for module MCUs  
- Recommended toolchains (GCC, SDCC)  
- Code structure conventions  
- I2C register map design  

---

## Safety & Responsibility Disclaimer

The guidelines described in this repository are intended to support reproducible, modular, and maker‑friendly designs within the noknok ecosystem. They do **not** replace professional engineering judgment.

By using these guidelines, you acknowledge that:

- You are responsible for ensuring **electrical safety**, **mechanical safety**, and **structural integrity** of your designs.  
- You must verify that your modules, housings, and assemblies comply with relevant **local regulations**, **material limitations**, and **use‑case requirements**.  
- noknok and its contributors are not liable for damages resulting from improper design, manufacturing, or use of modules or housings.

These guidelines are provided **as‑is** to support creativity and reproducibility in the community.

---

## License

- Documentation & standards: CC BY-SA 4.0 — see [LICENSE](LICENSE).

---

## Safety & Liability

noknok hardware is an electronic device and a DIY/maker kit. You assemble, modify, flash, power, and operate it at your own risk, and it is provided as is, without warranty. See the full notice: [License, Safety & Liability](https://buildwithnoknok.github.io/safety-and-license/).
