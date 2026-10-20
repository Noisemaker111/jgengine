### Added

- Painted terrain renders each layer's `surface` as its own procedural ground (grass, dirt, gravel, rock, sand, mud, snow, road) with albedo variation, roughness and micro-normals, blended along noise-warped, height-aware edges, in play and in the editor viewport. No game config or assets needed.
- `TerrainDetailConfig.surfaceStrength` (0..1, default 1) scales the per-surface response; `detail: false` opts a terrain out to the flat vertex-colour ground.
- `@jgengine/shell/terrain` exports `packTerrainPaintWeights`, `createTerrainPaintTextures`, `terrainSurfaceClass`, `createTerrainDetailMaterial` and `TerrainQualityContext`/`useTerrainQuality`.

### Changed

- A terrain without `detail` now renders with default procedural detail instead of flat vertex colour.
- Slope rock no longer fades with `detail.strength`; it follows `surfaceStrength`.
- The textured terrain path's normal map is applied in view space (it was added to the view-space normal as a world-space offset).
- The `low` graphics tier takes a cheap terrain surface path without micro-normals.
