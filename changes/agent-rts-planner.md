### Added

- `createBuildPlanner` (`@jgengine/core/ai/buildOrder`) plans an RTS opponent's economy: an ordered build order, tech paths inserted for unmet requirements (`resolveTechPath`, `missingRequirements`), supply providers made ahead of a block, a worker target and an army composition. A `DifficultyProfile` sets how often it decides, how often it picks a worse unit, and whether it saves or floats money. `snapshot`/`restore`/`retune`.
- `createAttackClock` (same module) launches growing attack waves once the army is big enough, or after `maxWait` with whatever army exists.
