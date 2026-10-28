`plant.grown` takes `deadYears`: a snag drops twigs, then limbs, then breaks and falls, faster in soft wood and warm climates

Engine seam: packages/core/src/plants/grown/plantGrowPool.ts, packages/core/src/plants/grown/plantGrowWorker.ts, packages/core/src/plants/grown/plantGrown.ts, packages/core/src/plants/growth/plantGrowth.ts

### Added

- `plant.grown` takes `deadYears`: a snag drops twigs, then limbs, then breaks and falls, faster in soft wood and warm climates
- `PlantGrowth.kill()` and `stats().decayClass` (snag decay classes 1–5)
- plant-life-cycle dev demo (a maple through its year, then decaying)

### Changed

- Part of #2699

### Fixed

- Fernwild's dead trees are snags, not winter maples
