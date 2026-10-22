### Added

- `decal` scene kind (`@jgengine/core/world/decalKind`) and its renderer (`@jgengine/shell/scene/DecalRenderer`): dirt, cracks, paint and blood decals authored as placed markers, draped on the live terrain or standing on an authored tilt, with a deterministic procedural texture per style+seed.
- `TerrainMaterialLayer.material` (`@jgengine/core/world/terraform`): a material library name whose scanned color map paints that terrain layer. The runtime samples up to four layer maps at each layer's `tiling` and blends them through the authored mask weights (`createTerrainDetailMaterial`'s `layerMaps`), so painted terrain blends between authored layers instead of tiling one flat map.
- `grass_field` volumes now paint a ground-cover mat under their blades (`groundCover` rule, `@jgengine/shell/terrain/GrassCover`), so an authored patch reads as turf rather than bare ground with stubble. `GrassEnvironmentConfig.groundCover` does the same for `grass()` patches.
- `ModelConfig.wind` (`@jgengine/core/game/playableGame`) and `applyModelWind` (`@jgengine/shell/render/modelWind`): per-model foliage sway with height-ramped travel, shared gust clock and per-model strength/speed/direction.

### Fixed

- The `ocean()` environment feature passes the live ground to its shader, so the sea shades shallow→deep and its shoreline foam band lands where the bed meets the surface.
