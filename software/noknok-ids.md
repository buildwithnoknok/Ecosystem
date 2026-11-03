# noknok ID Scheme: `MOD-xxxx` and `SET-xxxx`

> **Status: DRAFT (design proposal, 3 Nov 2026).** Defined by Christopher Houben and Max (naming
> and identification design). Not yet reviewed for hardware, firmware and software impact.
> What is **already in use today** and what is **only proposed** is marked in each section.
> Today the module registry ([`modules.json`](modules.json)) is keyed by module *type strings*
> (`buzzer`, `knob`, ...) and product manifests use readable ids such as `smart-lamp-v1`.
> Neither uses `MOD-` / `SET-` ids yet.

## Purpose

One human-typeable, scannable identity for every noknok module and every assembled product:
printable on a PCB, searchable on the website and, for modules, usable by product manifests to
find the right firmware.

## Concept

A **noknok ID** is a stable, opaque, numeric identifier. Two namespaces:

- `MOD-xxxx`: a module (one dedicated PCB / one SKU)
- `SET-xxxx`: an assembled product (modules + script + instructions)

Design principles:

- **Numeric only.** Legible on tiny silkscreen, unambiguous over the phone, no case problems.
- **Opaque.** No encoded meaning: no connector-type prefix, no baked-in revision. Everything
  descriptive lives on the ID's landing page, never parsed from the code. (Same approach as
  Adafruit's flat product IDs and LEGO's set numbers.)
- **4 digits padded, elastic width.** `MOD-0001` now; if a namespace passes 9999 it grows to 5
  digits. Issued IDs never change.
- **One-way.** Once printed or shipped, an ID is never renamed or merged, even if repositories
  are reorganised.

## `MOD-xxxx`

One module product line = one SKU = one dedicated PCB. An ID is independent of repository
structure. A genuinely different, incompatible PCB or firmware (new MCU, fundamentally different
design) gets a **new** `MOD-xxxx`; that is a judgment call made at the time, not an enforced rule.

**In use today:** the ID is printed in the module's repository name where it already exists
(`module-I2C-picohub-MOD-0011`) and on the board.

**Proposed object shape** (a landing-page record, not an existing file):

```json
{
  "id": "MOD-0001",
  "name": "noknok Buzzer",
  "bus": "I2C",
  "enum_key": "0x01",
  "description": "Piezo buzzer module for sound and alerts.",
  "firmware": { "current_version": "3.5.0", "history": [], "custom_alternatives": [] },
  "physical_designs": [ { "label": "Rev 3.1", "housing": "housing_v3.json" } ],
  "repo": "https://github.com/buildwithnoknok/module-I2C-buzzer"
}
```

- **Identity (fixed once assigned):** `id`, `name`, `bus`, `enum_key`. `enum_key` is the wire-level
  type code (I²C module type byte, see [Enumeration Protocol](enumeration.md#module-type-codes)) or
  the USB identity, i.e. what the Conductor matches when it enumerates. That is why `MOD-xxxx` has
  to correspond to what the module reports on the wire.
- **Content (free to edit):** `description`, `firmware` (current, history, community forks),
  `physical_designs`.
- **Pointer, not identity:** `repo` can change without affecting the ID.

### Current assignments (live products)

| ID | Module | Wire type (`enum_key`) |
|----|--------|-----------------------|
| `MOD-0001` | noknok Buzzer | `0x01` (I²C) |
| `MOD-0002` | noknok Knob | `0x02` (I²C) |
| `MOD-0003` | noknok LED Button | `0x03` (I²C) |
| `MOD-0004` | noknok Display | `0x05` (I²C) |
| `MOD-0005` | noknok LEDs | `0x04` (USB) |
| `MOD-0009` | noknok LEDs 16x | `0x06` (USB) |
| `MOD-0011` | noknok PicoHub | `0x07` (I²C) |

IDs not listed here are either unassigned or reserved. Gaps are normal: an issued number is never
reused.

### Silkscreen and QR

Printed as plain text `MOD-xxxx` (optionally the physical-design label, e.g. `Rev 3.1`) plus a QR
code linking to the landing page. Whether this fits on the smallest PCBs (CH32V003 modules) is
not yet checked; the fallback for the tightest boards is the QR code alone.

## `SET-xxxx`

An assembled product (modules + script + instructions). **Proposed:** a `SET-xxxx` *is* the
manifest's own `id` field, with no separate alias layer. Today a manifest `id` is a readable
string (`smart-lamp-v1`); the structure of the manifest is in
[Product Manifest](product-manifest.md) and [Authoring a Product](authoring-products.md).

### Catalog and file names (verified against the app)

The app has no server or database, only static file fetches. It fetches `manifests/catalog.json`
first and then each listed manifest URL individually; it never scans a folder. So `catalog.json`
is required: it is the list of every product that exists and where to find it. Manifest files keep
readable file names (`whack-a-mole.json`, not `SET-0003.json`): the ID is the opaque key, the file
name is a convenience for browsing and review, and the two are linked by `catalog.json`.

### Open question

Does every maker-uploaded manifest automatically get a `SET-xxxx`? Governance for community
products (official vs community namespace, any review step) is deferred and not decided here.

## Manifest rule: declare *what* and the *minimum*, never *where*

> Declare **what** you need and the **minimum** it must satisfy. Never declare **where** to get it
> or **exactly which** version you will receive. The system resolves that fresh, every time.

**In use today** (without `MOD-` ids): a manifest names a module by type string and a firmware
**floor** (`module_firmware[type].min`). The brain resolves the newest published firmware through
[`modules.json`](modules.json) and each module's `firmware/index.json`, so firmware URLs are not
hand-copied into manifests any more. See [Module Firmware Index](firmware-index.md).

**Proposed:** reference modules by `MOD-xxxx` instead of the type string
(`{ "id": "MOD-0003", "count": 10, "firmware": ">=2.2.0" }`), with no ceiling, resolved through the
same registry. An explicit pinned URL stays available as an escape hatch for custom or forked
firmware, so the app never silently replaces a maker's own build with the official one.

## Proposed changes this scheme would need

- Key `modules.json` (or add an alias) by `MOD-xxxx` next to the type string.
- `product-manifest.schema.json`: `modules_required[].id` as `MOD-xxxx`; fold `module_firmware`
  into a per-entry `firmware` floor.
- Close the `moduleType` enum gap independent of this scheme (the schema's list does not yet match
  the shipped modules).
- Decide how a hardware revision would be discovered at enumeration, for the rare case a physical
  change needs it (likely a bootloader-level signal; not designed).
