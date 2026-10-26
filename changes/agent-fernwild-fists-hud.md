Fernwild tames level up as in ARK and mounts run on their own stamina; punches knock out; and Shift works: a game binding `ShiftLeft` (sprint in ten games) never matched a pressed Shift, so nobody could sprint.

Engine seam: packages/core/src/progression/statPoints.ts (new), packages/core/src/input/actionBindings.ts (bindingMatches), packages/jgengine/src/templates/driveSteps.ts (one chord sender with real modifiers), scripts/drive-dev.ts

Prevention: stat-points tests (an amount per point, a scaling point from an owner's own base, a per-stat cap, saved sheets normalised); an input test that a `ShiftLeft` binding holds while either Shift is down (red before the fix); a drive test that a held Shift chord sends Shift's real key, code and modifier bit; headless Fernwild tests (a punch deals 8 damage and 7 torpor; the HUD's health is the pool hits land on; a tame levels on ARK's curve, spends points into health, earns a kill's XP, and burns 6 stamina a second sprinting); loop proof `bun run drive fernwild --flow fernwild-tame` (31 steps: two tame levels, a point into health, a ridden sprint that drains the mount's stamina).

Bends: none.

### Added

- `createStatPoints` (`@jgengine/core/progression/statPoints`): level-up points spent into stats. Each stat has a base and what a point adds, either an amount (a survivor's +10 health) or a fraction of the base (a tame's +5.4% health), with a per-owner base override and an optional per-stat cap. Sheets are plain `{ stat: points }` records that save as they are.
- Fernwild tames level as in ARK: kills and a passive trickle give XP on the creature curve (10 x n per level, 88 levels past the tame), each level is a point for the tame's stat sheet, and mounts spend their own stamina on a sprint (raptor 6 a second, phiomia 20).

### Fixed

- Shift never held its action: pressed keys fold ShiftLeft/ShiftRight to `Shift`, but bindings kept `ShiftLeft` as written, so `sprint: ["ShiftLeft"]` (the documented form, in ten games) never matched. Binding and pressed key now fold the same way.
- Drive proofs could not hold a modifier: the chord sender gave Shift the key name `ShiftLeft` and no modifier bit. One shared sender now sends a real Shift, Control or Alt, used by both drive paths.
- Bare fists did no torpor. A punch now deals ARK's 1.75x its damage as torpor (a club 3.75x).
- The HUD's health read the survivor's vitals copy, which catches up with the health pool only on the next tick, so it could show a stale value. It now reads the pool itself.
- Phiomia stats were guesses; they are now ARK's (stamina 300, food 3000, weight 200, melee 10, walk 1.5 m/s).
