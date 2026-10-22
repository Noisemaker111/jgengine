### Migrate

- `MaterialMaps.displacement` (`@jgengine/assets`) and `TerrainMaterialMaps.displacement` (`@jgengine/core/world/features`) are optional now. A caller that used to invent a displacement URL can drop it; nothing reads it.

### Added

- `foliage/grass-macro` and `ground/dirt-macro` in the shared material library: the same ambientCG scans at a 24 m / 20 m tile, so they carry structure at the scale an RTS camera 50 m out resolves instead of texel noise.
- `libraryTerrainMaterial(name)` (`@jgengine/assets/catalogs/materialLibrary`) returns the terrain detail material config for a library name, tiling from the entry's authored metres and blending from its terrain policy; a map the archive does not ship is omitted.
- `libraryBuildingSurface(name, options)` and `librarySurfaceParameters(name)` bridge a library name to `BuildingSurfaceMaterial` and `MaterialSurfaceParameters`, so a facade names its material instead of hand-wiring maps, colour and repeat.
- The library reports a `displacement` role (`libraryMaterialRoles`) without loading it, and `MaterialMaps.displacement` / `TerrainMaterialMaps.displacement` are optional; ambientCG archives without one (Fingerprints001) no longer publish a phantom displacement URL. `libraryTerrainMaterial` passes it through for callers that do displace.
- `terrain-macro` dev demo captures one field from 52 m in `?mode=flat|dense|macro` to compare ground materials at RTS scale.
