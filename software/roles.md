# Role Assignment

How human-readable names are mapped to specific physical modules, so a product code
always talks to the right one, regardless of discovery order.

## Why roles exist

Module discovery order varies between boots (the enumeration backoff is randomized by
UID, see [enumeration.md](enumeration.md)). Without roles, `c.buzzer[0]` might be a
different physical buzzer each boot. A role binds a stable name to a module permanent
64-bit UID, so `c.role["alert_buzzer"]` is always the same physical module.

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

A product manifest declares the roles it needs (a roles list), each with a prompt and
the module type it applies to. The app and Conductor then guide the user:

1. The app shows a prompt, e.g. "Press the button you want for OK".
2. The Conductor watches the modules of that type and waits for an interaction
   (a button press, a knob turn).
3. The module the user touched identifies itself; its UID is saved under the role.
4. Already-assigned modules are excluded, so each role maps to a distinct module.

This is the role-assignment step of first-time setup (see the system architecture
"Customer Journey" / Flow C).

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