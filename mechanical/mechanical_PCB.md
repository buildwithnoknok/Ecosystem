# PCB Mechanical Guidelines

These guidelines define the physical standards for noknok PCBs, including module dimensions, mounting holes, connector clearances, and mechanical tolerances.
They ensure that all modules remain compatible with housings, standoffs, and other modules.

---

## 1. Standard PCB Sizes

To ensure consistency and predictable enclosure design, modules should follow these standard sizes:

- **20 × 20 mm** — ultra‑compact modules (simple sensors, I2C devices)
  - (120/80) - (140/100) in KiCad PCB Design
  - Holes at (122/82) and (138/98) with 2.2mm diameter, non plated through hole
  - 5-pin castellated edge pads at (126.19/80) for MCU flashing
  - 4-pin castellated edge pads at (133.81/100) for I2C connector
  - JST 4-pin I2C connectors (123.1/95.5 at -90° rotation) and (136.9/84.5 at 90° rotation)
  ![2x2cm PCB-design](mechanical/Guidelines_PCB_dimensions_2x2cm_I2C.png)
- **40 × 40 mm** — USB-C modules (audio, motor drivers, connectivity)
  - (120/80) - (160/120) in KiCad PCB Design
  - Holes at (124/84), (156/84), (124/116) and (156/116) with 2.8mm diameter, non plated through hole
  - downstream JST 4-pin I2C connector (156.5/100 at 90° rotation)
  - USB connector (123/100 at -90° rotation)
  ![4x4cm PCB-design](mechanical/Guidelines_PCB_dimensions_4x4cm_USB.png)
- **40 × 60 mm** — larger modules (USB Hub, USB Power, etc.)

For standardized noknok modules, any other dimensions should increase size by increments of 1cm.
i.e. please do not use e.g. 2.53cm x 1.48cm dimensions. Instead go for full centimeters: 1x1cm, 1x4cm, 5x8cm, etc.
This facilitates 3D housing design.
