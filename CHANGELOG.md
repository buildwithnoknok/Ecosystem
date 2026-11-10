# noknok system releases

The public release notes for the noknok ecosystem as a whole. One entry per **system version**.
A system version is a pinned set of component versions that were tested together. Each component
keeps its own version and its own `CHANGELOG.md` in its repository; this file is the summary of all.

Newest first. Each entry has: date, pinned component versions, highlights, breaking changes with
migration notes, and links to the component changelogs. Written by the noknok team; internal test
reports and delivery checklists are not part of this file.

## Unreleased

Nothing yet.

## v1.3.1 - 2026-11-09

A reliability follow-up to v1.3.0. Module updates now reach a running brain, a parked brain stays
reachable, recovery keeps your WiFi, and the matching app improvements follow with the next app update. Every change
was verified on the noknok bench, and the final code was checked together on a brain with all modules
attached next to non-noknok I2C boards.

### Pinned component versions

| Component | Version | Source |
|---|---|---|
| noknok Buzzer firmware | 3.5.0 | [module-I2C-buzzer](https://github.com/buildwithnoknok/module-I2C-buzzer) |
| noknok Knob firmware | 2.3.0 | [module-I2C-knob](https://github.com/buildwithnoknok/module-I2C-knob) |
| noknok LED Button firmware | 2.4.1 | [module-I2C-ledbutton](https://github.com/buildwithnoknok/module-I2C-ledbutton) |
| noknok LEDs firmware | 1.8.2 | [module-usb-led](https://github.com/buildwithnoknok/module-usb-led) |
| noknok LEDs 16x firmware | 2.2.1 | [module-usb-led-16x](https://github.com/buildwithnoknok/module-usb-led-16x) |
| noknok Display firmware | 0.7.1 | [module-I2C-1.42-display](https://github.com/buildwithnoknok/module-I2C-1.42-display) |
| noknok PicoHub power manager firmware | 0.3.1 | [module-I2C-picohub-MOD-0011](https://github.com/buildwithnoknok/module-I2C-picohub-MOD-0011) |
| I2C module bootloader (stage-1), CH32V003 | 1.2.0 | [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader) |
| I2C module bootloader (stage-1), CH32X035 | 1.0.0 | [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader) |
| USB module bootloader | 1.1.0 | [module-USB-bootloader](https://github.com/buildwithnoknok/module-USB-bootloader) |
| Module registry (`software/modules.json`) | 1.4.0 | this repository |
| Brain library (`noknok.py`) | 1.26 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain USB driver (`noknok_usb.py`) | 1.3 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain app channel (`noknok_rpc.py`) | 0.6.2 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain provisioning (`code.py`) | 0.43 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Products | Button Light 1.0.1, Smart Lamp Mini 1.0.0, Smart Lamp Midi 2.0.0, Smart Lamp Maxi 1.1.1, Multicolor Lamp 16x 1.0.0, Whack-a-Mole 1.0.0 | [poc](https://github.com/buildwithnoknok/poc) |
| noknok app | 1.5.7 in the store today; 1.5.11 follows | closed source |

Tested together on brain-Pico `main`, software at commit d5060da (code.py 0.43); later commits are documentation only.

### Highlights

- **Module updates reach a running brain.** The daily update check now downloads each module image in
  small pieces instead of one big block, so the PicoHub update (0.3.0 to 0.3.1) arrives over the air.
  Before, large images failed for lack of free memory.
- **Cleaner power-up of the PicoHub.** PicoHub firmware 0.3.1 stops the 5 V rail from being switched off
  while it is already running, so the modules no longer get a short double power-up at a cold start.
  This was the likely reason the noknok Display sometimes stayed dark after a cold start on a weak 5 V supply.
- **A parked brain stays reachable.** A brain that stopped its product after three crashes now joins
  WiFi, answers the app within about 10 seconds, and the app can restart it. It no longer needs a power cycle.
- **"Recover my device" keeps your WiFi.** Re-flashing a brain with the recovery image (not the wipe
  image) brings it back on your home WiFi by itself, also for brains set up before the WiFi copy was stored.
- **A swapped module is recognised.** If a different module sits at a saved address, the brain notices and
  sets it up again. It can no longer mistake it for the old module, so a PicoHub at an old Knob address
  does not trigger an accidental factory reset.
- **A wiped brain adopts modules that stayed powered.** After re-flashing with the wipe image while the
  modules keep their power, the brain finds them again.
- **App improvements follow (app 1.5.11).** The next app update retries a dropped request once, shows a
  plain-language message instead of a raw network error when the phone has no internet, polls the device
  page gently so it no longer overloads the brain, and lets setup recover when the phone changes WiFi band.

### Known limitations

- **Weak 5 V supply:** use a proper 5 V charger or USB-C PD power. PicoHub 0.3.1 improves the cold start;
  the long unattended power-cut proof with it (100 or more cuts) is still to come.
- **Very slow or broken network clients** can still pause the brain for about 10 seconds. Normal app use
  is not affected.
- **After a power cut**, a module is rarely missing at power-on. Power-cycle the product again.
- **Module images larger than 16 KB** are updated over the air with the new download method; the largest
  real image today (16.8 KB) was verified, larger test images have not been tried on hardware yet.
- **Wiped brain next to other I2C boards:** a brain with no saved modules sends one identification
  request to each unknown I2C device. It never gives a foreign board an address or a driver.

### Breaking changes

None.

## v1.3.0 - 2026-11-03

A reliability release. The brain now copes much better with weak WiFi, power cuts and busy app traffic,
and it never sits silent without a reason. Every change was verified on the noknok bench, and the
release as a whole was checked on a brain with all modules attached, including a 7-hour soak with
486 real power cuts.

### Pinned component versions

| Component | Version | Source |
|---|---|---|
| noknok Buzzer firmware | 3.5.0 | [module-I2C-buzzer](https://github.com/buildwithnoknok/module-I2C-buzzer) |
| noknok Knob firmware | 2.3.0 | [module-I2C-knob](https://github.com/buildwithnoknok/module-I2C-knob) |
| noknok LED Button firmware | 2.4.1 | [module-I2C-ledbutton](https://github.com/buildwithnoknok/module-I2C-ledbutton) |
| noknok LEDs firmware | 1.8.2 | [module-usb-led](https://github.com/buildwithnoknok/module-usb-led) |
| noknok LEDs 16x firmware | 2.2.1 | [module-usb-led-16x](https://github.com/buildwithnoknok/module-usb-led-16x) |
| noknok Display firmware | 0.7.1 | [module-I2C-1.42-display](https://github.com/buildwithnoknok/module-I2C-1.42-display) |
| noknok PicoHub power manager firmware | 0.3.0 | [module-I2C-picohub-MOD-0011](https://github.com/buildwithnoknok/module-I2C-picohub-MOD-0011) |
| I2C module bootloader (stage-1), CH32V003 | 1.2.0 | [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader) |
| I2C module bootloader (stage-1), CH32X035 | 1.0.0 | [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader) |
| USB module bootloader | 1.1.0 | [module-USB-bootloader](https://github.com/buildwithnoknok/module-USB-bootloader) |
| Module registry (`software/modules.json`) | 1.4.0 | this repository |
| Brain library (`noknok.py`) | 1.24 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain USB driver (`noknok_usb.py`) | 1.3 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain app channel (`noknok_rpc.py`) | 0.6.2 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain provisioning (`code.py`) | 0.39 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Products | Button Light 1.0.1, Smart Lamp Mini 1.0.0, Smart Lamp Midi 2.0.0, Smart Lamp Maxi 1.1.1, Multicolor Lamp 16x 1.0.0, Whack-a-Mole 1.0.0 | [poc](https://github.com/buildwithnoknok/poc) |
| noknok app | 1.5.7 | closed source |

Tested together on brain-Pico `main` at commit 45f0d93.

### Highlights

- **Steadier on weak WiFi.** After a weak signal or a router restart the brain now checks that the router
  really answers and rejoins by itself. The LED Button no longer lags or queues presses while the app is
  connected over a weak link.
- **A busy or broken network client cannot freeze the product.** A client that connects and closes
  without sending a request, or that stalls halfway, no longer blocks the brain. About 1 in 100 app
  requests used to fail on the Smart Lamp Maxi; this is fixed with a larger Python stack in
  `settings.toml`.
- **No more hangs from a connected computer.** Console output never blocks the brain, so a computer
  that holds the serial port open cannot freeze it, and the brain switches its radio off before a
  deliberate restart so it comes back cleanly.
- **Safer power cuts.** A power cut during a settings write no longer leaves the brain hanging, a brownout
  no longer leaves it in safe mode, and an interrupted module update is rescued on the next start.
- **More robust module updates and detection.** The noknok Display handles I2C glitches better
  (Display firmware 0.7.1), the USB host recovers when a USB module restarts during an update, an old Knob
  with the legacy bootloader is recognised correctly, and module bootloader versions are remembered
  correctly after a bootloader update.
- **Setup is more forgiving.** Setup retries the WiFi scan instead of refusing your home network after one
  missed scan, an offline brain retries WiFi, and the brain no longer hands a noknok module an address
  that a non-noknok I2C device already uses.
- **Smart Lamp Maxi:** a quick on/off/on/off no longer leaves the lamp in the wrong colour.
- **One-file brain image.** A single `.uf2` brain image is now available for factory flashing and recovery.

### Documentation

- DEV-184 - new [Firmware File Header & Versioning Standard](software/firmware-header.md): the source-file header and version block every module firmware carries, and the places a version must be kept in sync.
- DEV-184 - new [noknok ID Scheme](software/noknok-ids.md) (`MOD-xxxx` / `SET-xxxx`), published as a **draft** proposal.
- DEV-184 - `electrical/readme.md`: removed references to power and hub boards that are not products; power guidance now refers to the noknok PicoHub.
- DEV-184 - `software/enumeration.md`: USB modules are connected directly to the host port (hub operation is not validated yet); PicoHub type `0x07` driver status corrected.
- DEV-184 - `software/readme.md`: `GET_VERSION` text brought up to date, `0xB4 GET_ID` recorded as decided but not yet implemented, module type codes now point to the full list.

### Known limitations

- **Weak 5 V supply:** with a supply below about 4.9 V the noknok Display can stay dark after a cold
  power-up. Use a proper 5 V charger or USB-C PD power. We are investigating the exact threshold.
- **Very slow or broken network clients** can still pause the brain for about 10 seconds. Normal app use
  is not affected.
- **After a power cut**, a module is rarely missing at power-on. Power-cycle the product again.
- **Re-flashing the brain with a wipe image** while the PicoHub input is powered can leave the I2C modules
  unrecognised until you power-cycle the PicoHub input. Setting up from the app (factory reset) is not
  affected.

### Breaking changes

None.

## v1.2.0 - 2026-10-22

Two I2C buses, safer setup and updates, and first support for the noknok PicoHub. Every change was
verified on its own on the noknok bench, and the latest versions were checked together on a brain with
six modules on two buses plus USB. A full end-to-end regression of all components follows before the
first production batch.

### Pinned component versions

| Component | Version | Source |
|---|---|---|
| noknok Buzzer firmware | 3.5.0 | [module-I2C-buzzer](https://github.com/buildwithnoknok/module-I2C-buzzer) |
| noknok Knob firmware | 2.3.0 | [module-I2C-knob](https://github.com/buildwithnoknok/module-I2C-knob) |
| noknok LED Button firmware | 2.4.1 | [module-I2C-ledbutton](https://github.com/buildwithnoknok/module-I2C-ledbutton) |
| noknok LEDs firmware | 1.8.2 | [module-usb-led](https://github.com/buildwithnoknok/module-usb-led) |
| noknok LEDs 16x firmware | 2.2.1 | [module-usb-led-16x](https://github.com/buildwithnoknok/module-usb-led-16x) |
| noknok Display firmware | 0.7.0 | [module-I2C-1.42-display](https://github.com/buildwithnoknok/module-I2C-1.42-display) |
| noknok PicoHub power manager firmware (new) | 0.3.0 | [module-I2C-picohub-MOD-0011](https://github.com/buildwithnoknok/module-I2C-picohub-MOD-0011) |
| I2C module bootloader (stage-1), CH32V003 | 1.2.0 | [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader) |
| I2C module bootloader (stage-1), CH32X035 (new) | 1.0.0 | [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader) |
| USB module bootloader | 1.1.0 | [module-USB-bootloader](https://github.com/buildwithnoknok/module-USB-bootloader) |
| Module registry (`software/modules.json`) | 1.4.0 | this repository |
| Brain library (`noknok.py`) | 1.18 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain USB driver (`noknok_usb.py`) | 1.2 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain app channel (`noknok_rpc.py`) | 0.1 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Brain provisioning (`code.py`) | 0.30 | [brain-Pico](https://github.com/buildwithnoknok/brain-Pico) |
| Products | Button Light 1.0.1, Smart Lamp Mini 1.0.0, Smart Lamp Midi 2.0.0, Smart Lamp Maxi 1.1.0, Multicolor Lamp 16x 1.0.0, Whack-a-Mole 1.0.0 | [poc](https://github.com/buildwithnoknok/poc) |
| noknok app | 1.5.7 | closed source |

### Highlights

- **Two I2C buses.** The brain drives a second I2C bus, so all Qwiic ports of a two-bus carrier work.
  Modules keep their address when you move them between buses. Pins are set in `settings.toml`.
- **Clear feedback on a wrong WiFi password.** Setup now tells you the password was rejected and lets
  you try again; the setup hotspot comes back reliably.
- **Updates for every module.** The noknok Display and the noknok LEDs 16x are in the module registry,
  so the brain updates them like all other modules and can rescue a Display that was interrupted
  mid-update.
- **No more silently stuck modules.** If a module is stuck in its bootloader and cannot be rescued
  right now (for example offline), the brain reports it clearly and retries on the next boot with
  internet; with a cached image it is rescued even offline.
- **noknok PicoHub, first support.** The power manager of the PicoHub carrier is a standard noknok I2C
  module with its own update path. Early status: see the module repository for its current limits.
- Smaller fixes found during testing: steadier setup after a successful join, more free memory for
  product downloads, reliable LEDs 16x updates over the air.

### Breaking changes

- **I2C pins must be set in `settings.toml`.** The brain no longer assumes default pins. A brain
  without pin settings finds no I2C modules and reports this at boot. Migration: on a noknok PicoHub,
  install `software/settings.toml` from brain-Pico (it holds the PicoHub pins); on any other board, add
  `NOKNOK_I2C_SDA` / `NOKNOK_I2C_SCL` (for example `"GP8"` / `"GP9"`) and, for a second bus,
  `NOKNOK_I2C_B_SDA` / `NOKNOK_I2C_B_SCL`.
- **An external FRAM is used only when switched on.** The settings store uses an I2C FRAM at 0x50 only
  if `settings.toml` has `NOKNOK_FRAM = 1`; otherwise it uses the Pico's built-in memory and never
  touches that address. If you added an FRAM yourself, add that line.
- The brain's `/firmware/check` request and the `firmware.check` operation are removed; only the noknok
  app used them, and module updates happen automatically during the brain's update check.

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