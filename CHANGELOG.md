# noknok system releases

The public release notes for the noknok ecosystem as a whole. One entry per **system version**.
A system version is a pinned set of component versions that were tested together. Each component
keeps its own version and its own `CHANGELOG.md` in its repository; this file is the summary of all.

Newest first. Each entry has: date, pinned component versions, highlights, breaking changes with
migration notes, and links to the component changelogs. Written by the noknok team; internal test
reports and delivery checklists are not part of this file.

## v1.1.0 - 2026-10-17

Reliability, app settings, and two new modules. Every change in this version was verified on its own
on the noknok bench. A full end-to-end run of all components together is planned before the first
production batch.

### Pinned component versions

| Component | Version | Source |
|---|---|---|
| noknok Buzzer firmware | 3.5.0 | [module-I2C-buzzer](https://github.com/buildwithnoknok/module-I2C-buzzer) |
| noknok Knob firmware | 2.3.0 | [module-I2C-knob](https://github.com/buildwithnoknok/module-I2C-knob) |
| noknok LED Button firmware | 2.4.1 | [module-I2C-ledbutton](https://github.com/buildwithnoknok/module-I2C-ledbutton) |
| noknok LEDs firmware | 1.8.2 | [module-usb-led](https://github.com/buildwithnoknok/module-usb-led) |
| noknok LEDs 16x firmware (new) | 2.2.1 | [module-usb-led-16x](https://github.com/buildwithnoknok/module-usb-led-16x) |
| noknok Display firmware (new) | 0.7.0 | [module-I2C-1.42-display](https://github.com/buildwithnoknok/module-I2C-1.42-display) |
| I2C module bootloader (stage-1) | 1.2.0 | [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader) |
| USB module bootloader | 1.1.0 | [module-USB-bootloader](https://github.com/buildwithnoknok/module-USB-bootloader) |
| Brain library (`noknok.py`) | 1.13 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain USB driver (`noknok_usb.py`) | 1.1 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain app channel (`noknok_rpc.py`) | 0.1 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain provisioning (`code.py`) | 0.18 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Products | Button Light 1.0.1, Smart Lamp Mini 1.0.0, Smart Lamp Midi 2.0.0, Smart Lamp Maxi 1.1.0, Multicolor Lamp 16x 1.0.0, Whack-a-Mole 1.0.0 | [poc](https://github.com/buildwithnoknok/poc) |
| noknok app | 1.5.2 | closed source |

### Highlights

- **Unplug any time.** The brain no longer writes to its file system while a product runs, so
  pulling the cable cannot damage its files. Product settings live in a separate memory area.
- **Change settings from the app while the product runs.** The app builds a settings page from the
  product manifest (`config_schema` v2: toggle, slider, colour, select, text, time) and talks to
  the running product over WiFi. Products read their settings with `c.settings`.
- **Factory reset always works.** Holding the reset gesture now also works when no product is
  running.
- **Safer module updates.** The brain checks that a firmware image matches the bootloader layout
  of the module before installing it, and skips modules that would need a wired recovery.
- **New module: noknok LEDs 16x.** 16 RGBW LEDs with a power governor that respects the USB-C
  power budget and the board temperature. New product: Multicolor Lamp 16x.
- **New module: noknok Display.** 1.42" colour screen with all four orientations, plus the
  [Display Planner](software/display-planner/), a browser tool to lay out screen regions and icons
  and export the matching Python code. New product: Smart Lamp Maxi (lamp, clock, timer,
  wake-up light).
- Documentation now matches the code for enumeration, firmware updates, provisioning and settings.

### Breaking changes

- **`update_all()` needs the bootloader layout.** If you call `Conductor.update_all()` yourself
  with a firmware spec that has no `layout` field, I2C modules are now refused instead of updated.
  Migration: add `layout` to the spec (current I2C modules use layout 2). The app's update path is
  not affected; it already sends the layout.

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