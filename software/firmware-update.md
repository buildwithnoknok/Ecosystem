# Firmware Updates (I2C Bootloader)

How a noknok I2C module gets new firmware over the I2C bus, with no SWD cable.

> Applies to all CH32V003 I2C modules (Buzzer, Knob, LED Button). USB-C modules
> (CH32V203) are out of scope and will use a separate mechanism.

## Why

For a consumer product, a customer must be able to receive a firmware update through
the app: the Conductor (Pico) flashes each module automatically over I2C. A physical
SWD cable is only ever needed once, at manufacture.

## Flash layout (16 KB)

Each module flash is split into a fixed bootloader and an updatable application:

| Region | Address | Size | Written by |
|--------|---------|------|-----------|
| Bootloader | 0x0000 | 4 KB | SWD, once (immutable in the field) |
| Application | 0x1000 | 12 KB | I2C OTA (updated forever) |
| Metadata | 0x3FC0 | 64 B | I2C OTA: magic, app length, CRC32 |

The bootloader runs first on every reset. It boots the app only if the app CRC32
matches the stored metadata; otherwise (blank or interrupted flash) it waits safely
for a new image. A half-flashed module is never bricked.

## How an update happens

1. The product manifest module_firmware block gives a required version plus a GitHub
   Release .bin URL per module type.
2. The Conductor compares installed vs required; if outdated it downloads the .bin.
3. It sends command 0xB0 (ENTER_BOOTLOADER) to the running module, which resets into
   the bootloader at I2C address 0x7E.
4. The Conductor streams the image: ERASE, then WRITE_CHUNK (64-byte pages), then
   VERIFY (CRC32), then BOOT.
5. The module reboots into the new app and re-enumerates.

## What a module firmware must do to be updatable

Every CH32V003 application MUST be built to coexist with the bootloader:

- Linked at the 0x1000 offset (custom linker script), not 0x0000.
- Reserve the top 16 bytes of RAM (handoff cell at 0x200007F0).
- Implement command 0xB0 (ENTER_BOOTLOADER): write the handoff magic and reset.

The .bin referenced in a manifest is this offset-linked application image. The
bootloader is a separate binary, flashed once via SWD, and is never part of the OTA
payload.

## Recovery

- I2C: an interrupted flash fails the CRC check at next boot, so the module waits in
  the bootloader at 0x7E and the Conductor just retries. No cable needed.
- SWD: the unbrickable backstop. The WCH-LinkE can always reflash a module via the
  5-pin connector, independent of flash contents.

> Factory note: brand-new CH32V003 chips often ship read-protected, which blocks
> flashing. Run minichlink -p once (disables protection and mass-erases) before the
> first SWD flash.

## Reserved values (firmware standard)

| Item | Value |
|------|-------|
| Bootloader region | 4 KB at 0x0000 |
| Application offset | 0x1000 |
| Bootloader I2C address | 0x7E |
| ENTER_BOOTLOADER command | 0xB0 |
| Handoff RAM cell | 0x200007F0 (top 16 B of RAM) |
| CRC32 | zlib (polynomial 0xEDB88320) |
| Status LED | SWIO / PD1 (active-low, optional per board) |

## Full details

The complete bootloader design, I2C protocol, and flashing/recovery procedure live in
the bootloader repository: [module-I2C-bootloader](https://github.com/buildwithnoknok/module-I2C-bootloader)

## Related documentation

- [Software Guidelines](readme.md)
- [Enumeration Protocol](enumeration.md)
- [Role Assignment](roles.md)