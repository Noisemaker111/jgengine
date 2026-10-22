### Added

- `TerrainDetailMaterialConfig.missing` (`@jgengine/core/world/features`): a terrain detail material built from pulled scans no longer takes the whole view down when those maps are not on disk. `"procedural"` (the default) keeps the authored procedural ground and logs one warning naming the missing map, so a game whose asset packs are pulled rather than committed boots anywhere; `"fail"` keeps the presentation retry screen for a view that genuinely cannot render without the scan, which is what the recovery demo asks for.
