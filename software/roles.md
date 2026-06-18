# Role Assignment

How human-readable names are mapped to specific physical modules, so a product code
always talks to the right one, regardless of discovery order.

## Why roles exist

Module discovery order varies between boots (the enumeration backoff is randomized by
UID, see [enumeration.md](enumeration.md)). Without roles, `c.buzzer[0]` might be a
different physical buzzer each boot. A role binds a stable name to a module's permanent
**identity** — its 64-bit UID (I2C modules) or USB serial number (USB modules) — so
`c.role["alert_buzzer"]` is always the same physical module, regardless of bus.

## The mapping

Roles are stored on the Pico in `noknok_roles.json`, a simple name-to-UID map:

```json
{
  "volume_knob":  "e290abcd4ac1bc74",
  "alert_buzzer": "fc69abcd65eebdb8",
  "ok_button":    "..."
}
```

This is a Conductor-level file shared by every product; it is not module-specific.

## Assigning roles

### Guided (in a product / the app)

A product manifest declares the roles it needs, each with a prompt and the module type
it applies to. **How a module is selected during assignment depends on whether it is an
_input_ or an _output_ module** — an intrinsic property of the module type:

| Module | Type | Assignment method |
|--------|------|-------------------|
| knob | **input** | customer **interacts** — rotates or presses it |
| led_button | **input** | customer **interacts** — presses it |
| buzzer | **output** | Conductor **cues** each (beep) → customer **confirms** |
| leds (USB) | **output** | Conductor **cues** each (light) → customer **confirms** |

Input vs output is independent of the bus (I2C or USB). Output-only modules can't be
"touched", so they're identified the other way round: the Conductor makes each candidate
signal itself and the customer confirms which physical one.

**Input modules — interact-to-select:**
1. The app shows a prompt, e.g. "Press the button you want for OK".
2. The Conductor watches modules of that type and waits for an interaction
   (a button press, a knob turn).
3. The module the customer touched identifies itself; its identity is saved.

**Output modules — cue-and-confirm:**
1. The app gets the candidate list for that type.
2. For each candidate the Conductor cues it (the buzzer beeps / the LED ring lights
   white); the app asks "Assign the active one? **Yes** / **Next**".
3. On **Yes** the candidate's identity is saved under the role; on **Next** the cue is
   cleared and the next candidate is cued.

Already-assigned modules are excluded from both flows, so each role maps to a distinct
physical module. This is the role-assignment step of first-time setup (see the system
architecture "Customer Journey" / Flow C).

### Conductor API (used by the app)

The Conductor exposes transport- and type-agnostic primitives; the app orchestrates the
flow based on the module's `role_select_mode`:

```python
mode = c.role_select_mode("buzzer")        # -> "input" or "output"

# INPUT modules — one blocking call returns the touched module's identity:
ident = c.detect_interaction("knob", timeout=20, exclude=already)

# OUTPUT modules — app loops cue -> confirm over the candidates:
for ident in c.role_candidates("buzzer", exclude=already):
    c.role_cue(ident, True)      # beep / light up this one
    # ... app asks the customer: Yes (assign) or Next ...
    c.role_cue(ident, False)     # clear the cue

c.append_role("alert_buzzer", ident)       # persist role -> identity (both flows)
```

`ident` is the module's UID (I2C) or USB serial (USB) — a unique hex string; both
`c.role[name]` and `c.by_uid(ident)` resolve it the same way for either bus. New module
types slot in automatically by declaring `ROLE_SELECT = "input"` / `"output"` on their
driver class (and, for output modules, a `role_cue(on)` method).

### Manual (bench / development)

Run the wizard once from the Thonny REPL:

```python
from noknok import Conductor
c = Conductor()
c.enumerate()
c.setup_roles()     # each module identifies itself; you type a name into noknok_roles.json
```

## Using roles in product code

```python
from noknok import Conductor
c = Conductor()
c.enumerate()
c.load_roles()                       # loads noknok_roles.json

c.role["volume_knob"].read()
c.role["alert_buzzer"].play(880, 200)
c.role["ok_button"].set_color(0, 255, 0)
```

Roles survive reboots and re-enumeration because they are keyed on the UID, not the
runtime address.

## Related documentation

- [Enumeration Protocol](enumeration.md): discovery, UIDs, runtime addresses
- [Software Guidelines](readme.md)