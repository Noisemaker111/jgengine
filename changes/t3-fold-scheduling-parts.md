wave countdowns and population refills run on the shared schedule part; spawn picks, wave entries and population species use the shared weighted pick; pressure and interest tiers use tierAt

Refs #2817

### Migrate

- pickSpawnPoint is gone; use the spawn point selection in waves/spawnPoint built on distanceBiasRegion

### Added

- distanceBiasRegion and distanceBiasStrength in world/spatialSample, the one way to pick a spawn point by distance
- `selectSpawnPoint` (`@jgengine/core/authoring`): Select a spawn point by game intent, keeping the weighting in the placement part's candidate table. Also `SpawnPointBiasStrength`.
- `selectSpawnPoint` (`@jgengine/core/waves/spawnPoint`): Select a spawn point by game intent, keeping the weighting in the placement part's candidate table. Also `SpawnPointBiasStrength`.
- `distanceBiasRegion` (`@jgengine/core/world`): a flat candidate table. Also `DistanceBias`, `DistanceBiasStrength`, `SpawnPointBiasStrength`, `SpawnPointDistanceBias`, `SpawnPointSelectionOptions`, `distanceBiasStrength`, `selectSpawnPoint`.
- `distanceBiasRegion` (`@jgengine/core/world/spatialSample`): a flat candidate table. Also `DistanceBias`, `DistanceBiasStrength`, `distanceBiasStrength`.

### Fixed

- wave countdowns and population refills run on the shared schedule part; spawn picks, wave entries and population species use the shared weighted pick; pressure and interest tiers use tierAt

### Removed

- `@jgengine/core/waves/spawnDirector` no longer exports `SpawnPointBiasStrength`, `SpawnPointDistanceBias`, `SpawnPointSelectionOptions`, `pickSpawnPoint`.
- `@jgengine/core/world` no longer exports `pickSpawnPoint`.
