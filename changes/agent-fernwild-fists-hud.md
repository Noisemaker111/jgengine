Fernwild punches knock out as well as hurt, as in ARK, and the HUD's health always shows the health that hits land on.

Engine seam: none (games/fernwild only).

Prevention: a headless Fernwild test that one bare-fist punch on a phiomia deals 8 damage and 7 torpor; a survivor test that the HUD's health matches the survivor's health pool right after a hit, before the next tick.

Bends: none.

### Fixed

- Bare fists did no torpor, so a creature could not be punched unconscious. A punch now deals ARK's 1.75x its damage as torpor (a club deals 3.75x).
- The HUD's health read the survivor's vitals copy, which catches up with the health pool hits land on only on the next tick; it could show a stale value (once 100/100 against a real 197/550). It now reads the pool itself.
