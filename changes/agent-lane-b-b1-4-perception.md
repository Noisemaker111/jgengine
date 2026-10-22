### Changed

- `createPerception` (`@jgengine/core/world`, also `@jgengine/core/sensor/perception`) takes `isSegmentClear` instead of `occluded`: the game supplies collision as a "nothing blocks this segment" test, and it is only called for pairs already inside range and cone. **Migration:** flip the predicate — a `occluded: (from, to) => blocked(from, to)` becomes `isSegmentClear: (from, to) => !blocked(from, to)`.

### Added

- `createPerception` shares squad knowledge: `squadMates(observerId)` names an observer's roster, and a sighting one member makes is written into every mate's memory with `sourceId` (who saw it) and `sourceTick` (the observe pass it was recorded on). A mate's own sighting at the same instant replaces the hand-off. `maxSharesPerTick` (default 64, per observer pass) bounds a large roster and reports elided shares.
- Perception memory is auditable without guessing: `memoryOf(observerId, targetId)` returns the one remembered target with its confidence right now or `null` once it has faded, and `stats()` counts pair checks, range prunes, cone tests, line-of-sight calls, sightings, heard stimuli, shares and dropped shares. The check order is range → cone → line of sight, so occlusion work only sees the pruned set. `resetStats()` opens a measurement window; `memories` are pruned per observer so a 200-observer pass does not rescan every memory.
- `devtoolsName` registers a probe showing observers, remembered targets and the work counters, and `dispose()` removes it.
