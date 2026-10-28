the landform generator grows a terrain heightfield with rock, gravel, sand, mud and soil layers from uplift, rivers, landslides and dunes; prepare runs in a worker and results are cached

Closes #2742

### Added

- the landform generator grows a terrain heightfield with rock, gravel, sand, mud and soil layers from uplift, rivers, landslides and dunes; prepare runs in a worker and results are cached
- landformTerrainSnapshot turns a grown landform into the editor's terrain document, and the editor's grow_landform verb applies it as one undoable edit
- `LANDFORM_CACHE` (`@jgengine/core/landform/generator/landformGenerator`): The cache {@link LANDFORM_GENERATOR} uses: memory only. Also `LANDFORM_GENERATOR`, `LANDFORM_OUTPUT`, `LANDFORM_SCHEMA`, `LandformCache`, `LandformCacheOptions`, `LandformGeneratorOptions`, `LandformGeneratorParams`, `LandformGrower` and 7 more.
- `LANDFORM_TERRAIN_MAX_SIDE` (`@jgengine/core/landform/generator/landformTerrain`): Largest landform side `growLandform` accepts, so one job's work stays bounded. Also `LANDFORM_TERRAIN_SURFACES`, `LandformRecipe`, `LandformSnapshotOptions`, `LandformTerrain`, `growLandform`, `landformTerrainSnapshot`.
