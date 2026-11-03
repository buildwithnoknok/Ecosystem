# Firmware File Header & Versioning Standard

How every noknok module firmware declares *what it is* and *which version it is*, so the
version is predictable, machine-readable and the same in every place it appears.

This page is the standard for the **source file** and the **version number**. How the version is
used at run time is specified elsewhere:

- the `GET_VERSION` (`0xB1`) command that reports it: [Standard System Commands](readme.md#5-standard-system-commands)
- the published version the brain compares it against: [Module Firmware Index](firmware-index.md)
- how a new version reaches a module: [Firmware Updates (I2C Bootloader)](firmware-update.md),
  [Firmware Updates (USB Bootloader)](firmware-update-usb.md)

Applies to **all** module firmware: CH32V003 / CH32X035 I²C modules and CH32V203 USB modules alike.
USB modules adapt the "I2C protocol" block of the header to their own transport but keep the
header, the changelog and the version block identical.

---

## 1. Why a standard

- One predictable place to read "what is this, which version, which protocol" in any module's source.
- The version a module reports over `GET_VERSION` must equal the `version` published in its
  `firmware/index.json`. That equality is what lets the brain decide whether to update without
  downloading anything, so the reported version has to be correct.
- A new module (or a new maintainer) gets a copy-paste template instead of inventing a layout.

## 2. The standard version block

Near the top of the configuration section, every firmware declares:

```c
#define PROTOCOL_VERSION  0x01   /* noknok protocol/API version (NOT the firmware version) */
#define FW_VERSION_MAJOR  <n>    /* this module's firmware semver */
#define FW_VERSION_MINOR  <n>
#define FW_VERSION_PATCH  <n>
```

The `FW_VERSION_*` defines are what the module reports over `GET_VERSION`. The comment line at the
top of the source, the README and `firmware/index.json` are copies of the same number and must be
kept identical to the defines on every release.

## 3. The standard header (C entry-point file)

Every module firmware source file (`*.c` entry point) begins with this header, **below** the
license header of section 6.

```c
/*
 * noknok <Module Name> Module Firmware  v<MAJOR.MINOR.PATCH>
 * <MCU part> (<package>)  |  Stack: cnlohr/ch32fun
 *
 * Module type: 0x0<N>   |   Protocol version: 0x01
 *
 * -- Changelog ------------------------------------------------------------
 *   v<x.y.z>  <what changed>  (newest first)
 *   v<x.y.z>  ...
 *
 * -- Hardware -------------------------------------------------------------
 *   <pin map: signal = pin, one per line>
 *
 * -- I2C protocol ---------------------------------------------------------
 *   Enumeration : staging 0x7F, MODULE_TYPE 0x0<N>, response [UID x8][TYPE][CRC8]
 *   Pico WRITES : <module commands>
 *                 [0xB0] ENTER BOOTLOADER   [0xB1] GET VERSION   (standard)
 *   Pico READS  : <default read>
 *                 4 bytes after 0xB1: [PROTOCOL_VER, FW_MAJOR, FW_MINOR, FW_PATCH]
 */
```

The module type codes are listed in [Enumeration Protocol](enumeration.md#module-type-codes).

## 4. Versioning rules (semantic versioning)

`MAJOR.MINOR.PATCH`, [semver](https://semver.org).

| Bump | When | Example |
|------|------|---------|
| **PATCH** | Bug fix, no behaviour or protocol change | 3.2.0 → 3.2.1 |
| **MINOR** | Backwards-compatible feature (e.g. a new command) | 3.2.0 → 3.3.0 |
| **MAJOR** | Breaking change to the module's behaviour or command interface | 2.x → 3.0.0 |
| `PROTOCOL_VERSION` | Ecosystem-wide protocol change (enumeration format, reserved commands, byte layouts). Independent of any module's firmware version. `0x01` → `0x02` | — |

`PROTOCOL_VERSION` is **not** bumped for a new standard command that older firmware simply ignores:
the brain discovers such a capability by asking for it. The brain only trusts a `GET_VERSION` reply
whose first byte is `PROTOCOL_VERSION`, so raising it makes deployed brains treat updated modules as
"unknown firmware".

## 5. The places a version lives: keep them in sync

| Place | Form | Role |
|-------|------|------|
| `FW_VERSION_*` defines | `3 / 5 / 0` | What the module **reports** over `GET_VERSION` |
| `firmware/index.json` `version` | `"3.5.0"` | What the repo **publishes**; the single source the brain compares against. Regenerate `size` and `crc32` from the real binary, never type them |
| Header comment line 1 | `v3.5.0` | Human-readable at the top of the source |
| Module `README.md` and `CHANGELOG.md` | `v3.5.0` | Public-facing docs |

There are no git tags: the version in the repository is the source of truth. A release changes all
of the above in the **same commit** as the rebuilt `.bin`.

## 6. License header (SPDX), every code file

Every code file carries a short SPDX header, **above** the standard header of section 3. noknok
files travel individually (firmware is flashed, `noknok.py` is copied onto Picos, `product.py` is
fetched on its own), so a per-file header keeps the license attached when the file is separated
from the repository's root `LICENSE`.

Firmware (`.c`, `.h`), brain Python and product scripts are **MIT**:

```c
// SPDX-FileCopyrightText: 2026 noknok (Christopher Houben)
// SPDX-License-Identifier: MIT
```

Python uses `#` instead of `//`. Markdown, docs and schematics need no per-file header: the
repository's `LICENSE` (CC BY-SA 4.0 for hardware and docs) plus the README note covers them.
Licensing overview: [Safety & License](https://buildwithnoknok.github.io/safety-and-license/).

---

## Rationale and history

Why the version lives in code and in `index.json`, and the decision record for `GET_VERSION`, are kept
in the noknok internal documentation. This page is the spec.
