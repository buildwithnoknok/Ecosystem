# noknok system releases

The public release notes for the noknok ecosystem as a whole. One entry per **system version**.
A system version is a pinned set of component versions that were tested together. Each component
keeps its own version and its own `CHANGELOG.md` in its repository; this file is the summary of all.

Newest first. Each entry has: date, pinned component versions, highlights, breaking changes with
migration notes, and links to the component changelogs. Written by the noknok team; internal test
reports and delivery checklists are not part of this file.

## v1.0.0 - 2026-10-02 (baseline)

The MVP baseline. Everything listed here was working together on the noknok bench at this date.

### Pinned component versions

| Component | Version | Source |
|---|---|---|
| noknok Buzzer firmware | 3.5.0 | [module-I2C-buzzer](https://github.com/buildwithnoknok/module-I2C-buzzer) |
| noknok Knob firmware | 2.3.0 | [module-I2C-knob](https://github.com/buildwithnoknok/module-I2C-knob) |
| noknok LED Button firmware | 2.4.1 | [module-I2C-ledbutton](https://github.com/buildwithnoknok/module-I2C-ledbutton) |
| noknok LEDs firmware | 1.8.2 | [module-usb-led](https://github.com/buildwithnoknok/module-usb-led) |
| I2C module bootloader (stage-1) | 1.2.0 | [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader) |
| USB module bootloader | 1.1.0 | [module-USB-bootloader](https://github.com/buildwithnoknok/module-USB-bootloader) |
| Brain library (`noknok.py`) | 1.11 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain provisioning (`code.py`) | 0.18 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Products | Button Light 1.0.1, Smart Lamp Mini 1.0.0, Smart Lamp Midi 2.0.0, Whack-a-Mole 1.0.0 | [poc](https://github.com/buildwithnoknok/poc) |
| noknok app | 1.5.2 | closed source |

### Highlights

- Modules enumerate automatically on both buses (I2C and USB); no hard-coded addresses.
- Over-the-air firmware updates for I2C and USB modules, power-loss safe, driven by each module's
  `firmware/index.json` (see [firmware-index.md](software/firmware-index.md)).
- The I2C bootloader is split into a frozen stage-0 and a field-updatable stage-1.
- Product manifests with an app-configurable settings schema.

### Breaking changes

None. This is the baseline; later entries list breaking changes and how to migrate.