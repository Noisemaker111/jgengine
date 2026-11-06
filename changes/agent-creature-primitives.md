Taming is built from general parts now: a body's meters (vitals, moved to @jgengine/core/stats/vitals) take doses that land now or over seconds up to a cap, and a dose table says what each source gives each kind of receiver, in preference order. The same two pieces describe a dino's foods, a sim's meals and shield potions that fill only to 50

Engine seam: packages/core/src/gameplay.ts, packages/core/src/stats/doseTable.ts, packages/core/src/stats/vitals.ts

### Added

- `createDoseTable` (`@jgengine/core/stats/doseTable`): What each source does to each kind of receiver, as {@link VitalDose}s: a raptor's foods and how much taming, food and ineffectiveness each gives, a sim's meals and the needs they fill, a shooter's potions and the shield each pours in up to its cap, a dart's torpor by the body it lands in. Also `DoseTable`, `DoseTableOptions`, `DoseTableRows`, `hasRoomFor`.
- `createVitals` (`@jgengine/core/stats/vitals`): Survival vitals for one body — health, stamina, food, water, oxygen, torpor or anything the game names. Also `VitalDef`, `VitalDose`, `VitalFlag`, `VitalFlagChange`, `VitalLink`, `VitalRateModifier`, `Vitals`, `VitalsState` and 1 more.

### Changed

- Taming is built from general parts now: a body's meters (vitals, moved to @jgengine/core/stats/vitals) take doses that land now or over seconds up to a cap, and a dose table says what each source gives each kind of receiver, in preference order. The same two pieces describe a dino's foods, a sim's meals and shield potions that fill only to 50
- Fernwild's game-local subdual engine is deleted: torpor, belly, affinity and ineffectiveness are vitals, the diet is a dose table, knockout and the tame are flags. New proofs show waking loses the tame and a clean tame gives more levels; Fernwild scores 24/67
- Migration: import createVitals and its types from @jgengine/core/stats/vitals (was survival/vitals); VitalsState gains doses, and tick() also reports flags a change raised between ticks

### Removed

- `@jgengine/core/survival/vitals` no longer exports `VitalDef`, `VitalFlag`, `VitalFlagChange`, `VitalLink`, `VitalRateModifier`, `Vitals`, `VitalsState`, `VitalsTickOptions` and 1 more.
