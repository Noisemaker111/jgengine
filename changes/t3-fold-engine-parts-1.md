event, break, combo and resource meters, regen shields, vitals and body temperature run on the shared meter, pool and tier parts; stat modifiers stack through statGraph; reward claims use pickUniform

Refs #2817

Engine seam: packages/core/src/combat/breakMeters.ts, packages/core/src/combat/comboMeter.ts, packages/core/src/combat/regenShield.ts, packages/core/src/combat/resourcePool.ts, packages/core/src/combat/rewardAllocation.ts, packages/core/src/gameplay.ts, packages/core/src/stats/eventMeter.ts, packages/core/src/stats/statModifiers.ts and 3 more

### Migrate

- bodyTemperature needs the game's own steps; see Fernwild's for the old values

### Added

- statPoolFraction in stats/statPool; stagger and buildup meters save and restore their state
- `StaggerMeterState` (`@jgengine/core/combat/breakMeters`): A stagger gauge's saved state: its meter and whether it has broken.
- `ComfortBands` (`@jgengine/core/gameplay`): One ladder of comfort steps outside the comfortable band.
- `EventMeterMode` (`@jgengine/core/stats/eventMeter`): What a full meter does with the next gain: hold the fill until consumed, or carry the excess into a fresh cycle.
- `statPoolFraction` (`@jgengine/core/stats/statPool`): The pool's fill as `0..1` over its own `min..max`; `0` when the range is empty.
- `ComfortBands` (`@jgengine/core/survival/bodyTemperature`): One ladder of comfort steps outside the comfortable band.

### Fixed

- event, break, combo and resource meters, regen shields, vitals and body temperature run on the shared meter, pool and tier parts; stat modifiers stack through statGraph; reward claims use pickUniform

### Removed

- the engine's built-in body temperature bands and food and water defaults; Fernwild passes its own
- `@jgengine/core/gameplay` no longer exports `ComfortBand`.
- `@jgengine/core/survival/bodyTemperature` no longer exports `ComfortBand`.
