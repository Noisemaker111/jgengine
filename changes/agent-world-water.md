Water lives in one folder per layer, and the drawn water moves on the same waves the CPU surface (buoyancy) reads.

### Migrate

- `@jgengine/core/world/water` → `@jgengine/core/water/waterSurface`; `@jgengine/core/world/waterKind` → `@jgengine/core/water/waterKind`.
- `@jgengine/shell/scene/WaterRenderer` → `@jgengine/shell/water/WaterRenderer`; `@jgengine/shell/environment/oceanColor` → `@jgengine/shell/water/oceanColor`.
- `OceanConfig` wave fields (`amplitude`, `speed`, `direction`, `steepness`, `waveScale`, custom `waves[]`) are gone. Pass `waves: WaterSurfaceConfig` (`waveHeight`, `waveScale`, `waveSpeed`, `waves`, `choppiness`, `direction`, `steepness`), the same config `waterSurface` takes. `DEFAULT_OCEAN_WAVE_SCALE`, `OceanWaveConfig`, `OceanDirectionVector`, `OceanWaveDirection` and `ResolvedOceanWaveConfig` are removed; `ResolvedOceanConfig.waves` is `GerstnerWave[]`.

### Added

- `WaterSurfaceConfig.direction` (heading of the longest wave, degrees) and `steepness` (crest sharpness, 0..1 of the no-loop limit).
- `waterSurfaceConfigFromDescriptor`; `ResolvedWater.surface` carries an authored water volume's wave model.

### Fixed

- Ocean and authored water drew a different wave set from the CPU `waterSurface`, so floating bodies bobbed on waves that were not on screen. Both now come from `synthesizeWaves`.
- Ocean crest foam reads true crest sharpness, so calm ponds no longer foam over.
