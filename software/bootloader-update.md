# Bootloader Updates & World Migration (Runbook)

How a noknok module's **bootloader itself** is updated in the field, what every module
firmware must do to take part, and how a fleet is carried from one "world" (protocol /
identity scheme) to the next without stranding anyone. This is the runbook DEV-31 asked
for; the mechanism behind it is bench-proven (11 Sep 2026).

> Applies to CH32V003 I2C modules today. The CH32V203 USB modules get the same design on
> their own layout — see [Firmware Updates (USB Bootloader)](firmware-update-usb.md).
> Design and implementation detail: `module-I2C-bootloader/docs/stage0-design.md`.

## 1. Why this exists

Everything on a module was already field-updatable — the application over the bus, the
Conductor and product scripts via the manifest — except the bootloader. That mattered
because the big protocol/identity refactor is deliberately deferred until after
crowdfunding: whatever we decide then has to reach units already in backers' hands.

So the bootloader is split in two:

| | | Field-updatable? |
|---|---|---|
| **Stage-0** | 1 KB at `0x0000`, frozen at manufacture. Only two jobs: install a pending stage-1 update (verified copy from a staging area), then jump to stage-1. Speaks no bus. | **Never** — and it never needs to |
| **Stage-1** | **4 KB** at `0x0400` (layout 2, since 11 Sep 2026; was 3 KB). The real bootloader: I2C flashing, app validation, and now its own replacement. | Yes, via stage-0 |
| Application | `0x1400` (layout 2; `0x1000` under layout 1 and the legacy monolithic bootloader). | Yes, via stage-1 |

**Stage-0 never speaks a bus.** The *running stage-1* receives its own replacement into the
app region (used as staging), CRC-verifies it, writes a control block, and warm-resets.
Stage-0 finds the control block, verifies everything again itself, copies staging into the
stage-1 region page by page with read-back, clears the block, and resets into the new
stage-1. The application is destroyed by this (staging *is* the app region) and is re-pushed
straight afterwards.

## 2. Reserved values (firmware standard)

Additions to the [firmware-update](firmware-update.md) table. Fixed ecosystem-wide.

| Item | Value |
|---|---|
| Stage-0 region | 1 KB at `0x0000` — frozen forever |
| Stage-1 region | 4 KB at `0x0400` — **base must be 1 KB aligned** (the vector table lives there and `mtvec` ignores the low bits) |
| Application offset | `0x1400` (layout 2). Every app is linked here; a layout-1 / legacy-bootloader app (`0x1000`) cannot run on a layout-2 module and vice versa — the fleet moves together. The stage-1 image header carries the layout id, so `VERIFY_STAGE1` refuses a cross-layout stage-1 (error 8). |
| Bootloader control block | 64 B at `0x3F80` (stage-1 writes, stage-0 clears) |
| App metadata | 64 B at `0x3FC0` (unchanged) |
| Reserved no-init RAM | top 16 B, `0x200007F0`–`0x200007FF`, kept out of every linker's stack: `…F0` handoff cell (app → bootloader), `…F4` stage-0 install-attempt counter, `…F8` app boot-attempt counter |
| `VERIFY_STAGE1` | bootloader command `0x06` — same payload as `VERIFY`, arms a stage-1 update |
| `GET_VERSION` | `0xB1` — now answered by the **bootloader at `0x7E`** as well as by every app |
| `GET_UID` | `0xB3` — bootloader only; 8-byte chip UID, same bytes/order as the enumeration reply |
| Stage-1 image header | 16 B at image offset `0x100`: `{"NKS1", base, layout, version}` |

## 3. What every module firmware must do (the app-side contract)

Beyond the existing rules (link at `0x1400`, reserve the top 16 B of RAM, implement `0xB0`
and `0xB1`), every application **must**:

1. **Run the independent watchdog.** Start the IWDG right after `SystemInit()` (~2 s: LSI/64,
   reload 4095) and kick it once per main-loop iteration — and inside any loop that can
   legitimately run for a while. A hang thereby becomes a warm reset that stage-1 can count.
2. **Clear the boot-attempt counter once healthy.** Write `0` to `0x200007F8` the moment an
   I2C address has been assigned (`DEV_ASSIGNING → DEV_ASSIGNED`). That is the strongest
   "I work" signal an app has: enumeration completed, so I2C demonstrably works.

Why: stage-1 counts every boot of the app and, after **three** consecutive **watchdog** resets
without the counter being cleared (any other reset cause — power-on, software, SWD — starts a
fresh series), stops booting it and parks in the bootloader with
`last_error = 7` ("app unhealthy"). Without these two lines, an application with a *valid
CRC* that crashes or hangs is booted forever and the module is dead until SWD. With them, it
gets three tries (~6 s) and then waits at `0x7E` for the Conductor to rescue it (§6).

A `0xB0` reset never counts. A cold power-on randomises the counter (reads as 0), so a user
power-cycling the product gives the app three fresh tries — the right behaviour for a
transient. Reference implementations: LED Button v2.3, Buzzer v3.4.0, Knob v2.2.0,
Display v0.4.0 (identical ~20-line block in each).

## 4. How a bootloader update runs

**It is the same transfer as an application update.** Same `ERASE`, same `WRITE_CHUNK`, same
staging area — only the closing command differs, so the Conductor needs almost no new
machinery:

```
application update:  0xB0 -> ERASE -> WRITE_CHUNK xN -> VERIFY(0x04)        -> BOOT
stage-1 update:      0xB0 -> ERASE -> WRITE_CHUNK xN -> VERIFY_STAGE1(0x06) -> BOOT
                            -> (module vanishes ~300 ms while stage-0 installs)
                            -> new stage-1 at 0x7E -> push the application -> BOOT
```

In the Conductor: `noknok.py` `stage1_update(entry, stage1_image, app_image)` does all of
it, including re-pushing the app and re-enumerating. `bootloader_version(entry)` reads the
installed stage-1 version. Both are I2C-only until the USB port lands.

**What gets checked, and by whom, before anything is erased:**

| Check | Where | Refuses with |
|---|---|---|
| Staged image fits the stage-1 region (4 KB) | stage-1, `VERIFY_STAGE1` | error 4 |
| Staged image CRC matches what the host declared | stage-1 | error 5 |
| Staged image **is a stage-1 for this layout** (header at `+0x100`: `NKS1`, base `0x0400`, layout 1) | stage-1 | error 8 |
| Control block descriptor intact (its own CRC) | **stage-0** | not pending → boots old stage-1 |
| Descriptor geometry sane (can only ever address the stage-1 region) | stage-0 | not pending |
| Staged image CRC — **recomputed by stage-0**, it does not trust stage-1 | stage-0 | not pending |
| Every erased and programmed page read back | stage-0 | retry; then reset and retry the whole install (up to 4 boots); then halt (SWD) |

The last row is the answer to a brownout during install — the highest-current operation the
chip does. Stage-0 also waits ~50 ms before its first flash access on the update path.

**Host-side rule:** after `BOOT`, the *old* stage-1 is still answering at `0x7E` for a
moment. Wait for it to **disappear, then reappear**, then read `0xB1` to confirm the version
actually changed. Waiting only for it to appear returns the old one and you learn nothing.
Same on USB — same PID on both sides of the update.

## 5. Failure and recovery at every step

Every window recovers without physical access. Each row below is demonstrated on hardware
(`module-I2C-bootloader/firmware/stage0/test/run_swd_tests.sh`, 10/10).

| Power lost during… | Next boot | Recovery |
|---|---|---|
| staging transfer | no control block; stage-1 intact | boots stage-1 → flash mode → host retries |
| control-block write, before the magic | not a pending update | boots stage-1 → host retries |
| control-block write, after the magic (descriptor garbage) | **rejected** by stage-0's descriptor CRC | boots stage-1; marker left set, stage-1 rewrites it next time |
| stage-0 erase/copy | marker still set, staging untouched | stage-0 redoes the whole copy — idempotent |
| marker clear | copy already complete, marker still set | stage-0 redoes it (harmless), clears, boots new stage-1 |
| the application, any time | valid-CRC app crashes/hangs | watchdog → warm reset → stage-1 counts → after 3, parks with error 7 (§3) |

**What cannot be recovered without SWD:** a stage-1 that *installs* but is itself broken
(e.g. its I2C does not work). There is no flash for a second copy on a 16 KB part, so there
is no rollback. The header check removes the "wrong file" version of this; the rest is
process — §7.

## 6. The Conductor's rescue path

A module parked in its bootloader does not enumerate, so nothing else in the Conductor would
ever see it. `rescue_parked_module(get_image)` runs **first, before `enumerate()`**:

1. Probe `0x7E`. Nothing there → normal start-up.
2. Something there → `GET_VERSION`. No answer → legacy monolithic bootloader; it cannot be
   identified over the bus. Log it; a human flashes it over SWD.
3. `GET_UID` → look the UID up in `noknok_state.json` → the type it enumerated as last time.
4. `get_image(entry)` for that type → `flash()` (already in the bootloader) → `BOOT`.

Two things this depends on:

- **The Conductor must not forget modules that don't answer.** `_save_state()` merges into
  `noknok_state.json` rather than replacing it (a bug found and fixed on 11 Sep 2026: one
  enumeration with a module parked wiped its entry, and the rescue reported "unknown UID"
  for the very module it exists to rescue).
- **Rescue before any new update.** With a module already at `0x7E`, starting another update
  would put two modules there and neither could be reached. Doing rescue first is what
  keeps the "one module in the bootloader at a time" rule true in practice.

## 7. Releasing a stage-1 (the process that stands in for rollback)

Because a broken stage-1 cannot be rolled back over the bus, every stage-1 release goes
through this, no exceptions:

1. **Build with a version bump** (`S1_VERSION_*` in `noknok_stage1.c`, or
   `make build EXTRA_CFLAGS=-DS1_VERSION_PATCH=n` for test payloads). The image header
   carries the version; `GET_VERSION` reports it.
2. **Run the regression:** `sh firmware/stage0/test/regress_all.sh` on the bench Pi (module-
   I2C-bootloader repo). One command, ~4 min, must end in `ALL PASS`. It builds stage-0 and
   stage-1 from source and runs the ten stage-0 SWD images (`test_chain` with the new
   stage-1), the real self-update over I2C cross-checked over SWD, the Conductor's
   `stage1_update()` with app restore, the wrong-file refusal, the hanging-app park and the
   parked-module rescue. What each step proves and what a FAIL means: `TESTS.md` next to it.
3. **Staged rollout:** one module, then one product, then the fleet. The Conductor reads
   `bootloader_version()` and only pushes to modules below the target.
4. **Record** the version, sizes, and regression result in the bootloader repo's spec and on
   DEV-31 before anything ships.

Stage-1 v1.1.0 is 2928 B in its 4 KB (layout 2, 11 Sep 2026 — grown from 3 KB exactly this
way when the hardening round left 164 B and DEV-22 still had to land). If it ever has to grow
again, the same procedure applies: move the application base (stage-0 reads it as data), bump
the header layout id, relink every app — a combined stage-1 + all-apps release, and a
decision, not a build flag.

## 8. World migration (v1 → v2 protocol / identity)

When the post-crowdfunding refactor lands, this is how a fleet moves:

1. **App** updates via the Play Store — it now knows both worlds.
2. **Conductor + `product.py`** update via the manifest `files[]` — the Conductor must keep
   speaking v1 to modules that have not moved yet.
3. **Per module, one at a time**, driven by the Conductor:
   - `bootloader_version()` — is this even a stage-0/stage-1 module? (Silence on `0xB1` at
     `0x7E` = legacy world; it needs a one-time SWD reflash, not an OTA.)
   - if a new stage-1 is part of the migration: `stage1_update()` with the new stage-1
     *and* the new application in one call;
   - otherwise just `update_module()` with the new application.
4. **Version negotiation keeps a half-migrated set working.** Every app already reports
   `PROTOCOL_VERSION` via `0xB1`; the Conductor talks v1 to modules reporting 1 and v2 to
   those reporting 2 until the set is complete. No new "world" byte was needed.
5. **Escape hatches:** the app-level boot-attempt counter (§3) for anything that crashes;
   the button-hold factory-reset on modules that have a button (DEV-22); SWD in-house.

**What the maker sees:** "Your modules can be upgraded" in the app → a guided flow → each
module blinks through its update in turn → done. Any module that fails is parked, not
bricked, and the next start-up rescues it.

## 9. Bench validation summary (11 Sep 2026)

| What | Result |
|---|---|
| CH32V003 64-byte erase granularity | 2432 erases, isolation exact, CPU keeps running from the sector being erased |
| Stage-0 SWD suite (jump / update / all four power-loss windows / corrupt descriptor / corrupt staging / real-stage-1 chain) | 10/10 |
| Stage-1 self-update over I2C | v1.0.0 → v1.0.1 in 284 ms, SWD cross-check identical |
| Through the Conductor with app restore | v1.0.1 → v1.0.2, 9.4 s, module re-enumerated |
| Unhealthy app (valid CRC, hangs) | booted exactly 3 times, then parked with error 7 |
| Rescue of a parked module by UID | identified, re-flashed, back at its address |
| Wrong file as a stage-1 (valid CRC, no header) | refused, error 8, nothing armed |
| Full regression `regress_all.sh` (all of the above, one command, stage-1 2908 B, layout 1) | 6/6 PASS, 11 Sep 2026 evening |
| Layout 2 (stage-1 4 KB, apps at `0x1400`) | full image boots, LED Button 2.4.0 enumerates, `bootloader_version()` 1.1.1, boots back (smoke test; full regression pending) |

## Related documentation

- [Firmware Updates (I2C Bootloader)](firmware-update.md) — the application update flow
- [Firmware Updates (USB Bootloader)](firmware-update-usb.md)
- [Software Guidelines](readme.md) — standard commands, firmware conventions
- `module-I2C-bootloader/docs/stage0-design.md` — the full design spec
