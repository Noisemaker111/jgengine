Fernwild creatures use scatterPoints after the merge

Engine seam: packages/core/src/breeding/inheritance.ts, packages/core/src/inheritance/inheritance.ts, packages/core/src/movement/motionTrack.ts, packages/core/src/stats/statPool.ts, packages/core/src/time/pacedSchedule.ts

### Migrate

- @jgengine/core/breeding/inheritance is now @jgengine/core/inheritance/inheritance; inheritStats is inheritValues (result .values, options defaultRule and mutation.fields/amount, no 0.55 default) and scatterLevels is scatterPoints

### Added

- an inheritance part passes values from two parents per field, picked or blended, with mutations
- the meter part ticks regen, decay and a regen delay, and a change reports what overflowed
- a paced schedule part fires events at a pace from a start time, with jitter, a count, pause and save
- a motion track part moves a thing along a path over time and reports its arrival
- `inheritValues` (`@jgengine/core/inheritance/inheritance`): A child's values from two parents, field by field: each field picked whole from one parent or blended between them, then a few rare mutation rolls adding to random fields. Also `InheritMutation`, `InheritOptions`, `InheritRule`, `Inherited`, `scatterPoints`.
- `createMotionTrack` (`@jgengine/core/movement/motionTrack`): Moves a thing along a path of points over time and reports when it arrives. Also `MotionTrack`, `MotionTrackConfig`, `MotionTrackState`.
- `changeMeter` (`@jgengine/core/stats/statPool`): Add `amount` now (negative drains). Also `MeterRates`, `MeterState`, `createMeter`, `tickMeter`.
- `createPacedSchedule` (`@jgengine/core/time/pacedSchedule`): A pace from a start time: every `due(now)` call returns the events that have come due, drawing each jittered gap from the injected rng. Also `PacedSchedule`, `PacedScheduleConfig`, `PacedScheduleState`.

### Changed

- Merge remote-tracking branch 'origin/t3/general-value-inheritance' into agent/engine-parts
- # Conflicts:
- # games/capabilities.json
- # games/fernwild/src/game/creatures.ts
- # scripts/type-escape-baseline.json
- Merge remote-tracking branch 'origin/t3/meter-rates-overflow' into agent/engine-parts
- Merge remote-tracking branch 'origin/t3/paced-schedule' into agent/engine-parts
- Merge remote-tracking branch 'origin/t3/motion-track-part' into agent/engine-parts
- # .claude/skills/jgengine-world/capabilities.md

### Fixed

- Fernwild creatures use scatterPoints after the merge

### Removed

- `@jgengine/core/breeding/inheritance` no longer exports `InheritanceOptions`, `Inherited`, `inheritStats`, `scatterLevels`.
