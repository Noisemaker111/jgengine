terrain surfaces and paint layers take material-library ids with triplanar slopes and height blending; Fernwild's ground uses ambientCG scans

Part of #2837

### Added

- nine ambientCG ground scans in the material library (Ground033, Grass005, Ground020, Rock035, Ground054, Ground025, Gravel022, Gravel032, Ground031)
- `libraryTerrainSurface(name)` for `detail.surfaces.ground|sand|rock`; the editor's Scan picker and `set_terrain_layers` resolve a layer's library name to colour, normal, roughness, AO and height maps
- `detail.scanTriplanarAngle` (default 45) switches scans to side projections on slopes; scan height decides which layer breaks through at blend edges

### Migrate

- `TerrainMaterialLayer.materialUrl` is now `materialMaps`; `TerrainLayerMap`, `MAX_TERRAIN_LAYER_MAPS` and the detail material's `layerMaps` option are gone, scans go through `detail.surfaces` and paint layers (up to eight)
