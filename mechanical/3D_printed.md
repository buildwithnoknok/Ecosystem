# 3D‑Printed Housing Guidelines

These guidelines define how to design 3D‑printed housings and enclosures for noknok modules. They ensure reproducibility on consumer printers and mechanical compatibility with all module sizes.

---

## 1. Recommended 3D Printing Settings

Unless highlighted otherwise, all provided 3D enclosures for existing noknok products are optimized for the following settings:

### Printer Settings
- Layer height: **0.2 mm**
- Nozzle: **0.4 mm**
- Wall thickness: **1.2 mm** (3 perimeters)
- Infill: **15–25%**
- Supports: only when required

### Materials
- **PLA** — unless otherwise highlighted, all designs are optimized to be printed in PLA.
- **PETG** — most designs should also work using PETG to be stronger, more temperature‑resistant  
- **TPU** — for flexible parts

---

## 2. Housing Design Rules

### Mechanical PCB dimensions: 
- **[Please check the existing mechanical guidelines](mechanical_PCB.md)**

### Avoid
- Overhangs > 45°  
- Thin walls near screw bosses  
- Tight tolerances around USB‑C ports  

---

## 3. Mounting & Assembly

- Ideally, all assembly should be doable without the help of any tools (no screwdrivers, etc.)
- Provide **internal cable routing channels** for I2C and USB‑C cables.
- Ensure **ventilation** for high‑power modules (5G, audio amps) and heat dissipation of modules.
- Please follow common sense for mechanically stressed areas and high power electrical areas.

---

## 4. Summary
- Housings must be reproducible on consumer printers.  
- Clearances ensure reliable connector access.  
- Standard standoff and screw sizes unify the ecosystem.  
- Design rules ensure printability and mechanical robustness.

---

## 5. Safety & Responsibility Disclaimer

The mechanical guidelines described in this document are intended to support reproducible, modular, and maker‑friendly designs within the noknok ecosystem. They do **not** replace professional engineering judgment.

By using these guidelines, you acknowledge that:

- You are responsible for ensuring **electrical safety**, **mechanical safety**, and **structural integrity** of your designs.  
- You must verify that your modules, housings, and assemblies comply with relevant **local regulations**, **material limitations**, and **use‑case requirements**.  
- noknok and its contributors are not liable for damages resulting from improper design, manufacturing, or use of modules or housings.

These guidelines are provided **as‑is** to support creativity and reproducibility in the community.

