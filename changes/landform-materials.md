landform material layers: rivers sort gravel, sand and silt by settling speed, landslides lay scree, bedrock weathers into soil, and landformSurface paints the result as surface material weights

### Added

- landform material layers: rivers sort gravel, sand and silt by settling speed (alluvial fans fine downstream, lakes keep a coarse delta and settle silt over their floor), landslides lay scree, and bedrock weathers into soil by the Heimsath soil production function
- landformSurface reads a landscape out as per-cell blend weights over the rock, gravel, sand, mud and soil surface materials, with the bedrock id under each cell
- `LANDFORM_SURFACE_KINDS` (`@jgengine/core/landform/materials/landformSurface`): The surface kinds a landform paints, in their order in {@link LandformSurface.weights}. Also `LandformSurface`, `LandformSurfaceKind`, `LandformSurfaceOptions`, `landformSurface`.
- `COVER_CLASSES` (`@jgengine/core/landform/materials/sedimentCover`): Classes of loose cover, in their order in {@link SedimentCover.thickness}. Also `CoverClass`, `DEFAULT_GRAIN_SIZES`, `DEFAULT_ROCK_YIELD`, `GRAIN_CLASSES`, `GrainClass`, `GrainMix`, `GrainSizes`, `SCREE_YIELD` and 3 more.

### Changed

- Part of #2742
