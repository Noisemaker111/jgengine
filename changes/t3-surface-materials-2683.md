a seeded surface material generator (sand, grass, soil, mud, rock, gravel, bark, snow) on the generator contract, baking tileable albedo, height, normal, roughness and AO once at load in slices

Closes #2683

Engine seam: packages/core/src/environment/EnvironmentScene.draw.tsx, packages/core/src/material/surfaceMaterialGenerator.ts, packages/core/src/material/surfaceMaterialPreview.draw.tsx, packages/core/src/material/surfaceMaterialTextures.draw.ts, packages/core/src/nature/natureGenerators.ts, packages/core/src/nature/natureMesh.draw.ts, packages/core/src/nature/natureMesh.ts, packages/core/src/nature/naturePreview.draw.tsx and 5 more

### Added

- a seeded surface material generator (sand, grass, soil, mud, rock, gravel, bark, snow) on the generator contract, baking tileable albedo, height, normal, roughness and AO once at load in slices
- terrain detail.surfaces blends generated ground, shoreline sand and slope rock through the existing terrain detail material, with anti-tiling and height-aware edges
- generated rock and driftwood use the rock and bark surfaces, projected in world space
- a material-variants dev demo showing every preset, or seeded variants of one
- `SURFACE_MATERIAL_GENERATOR` (`@jgengine/core/material/surfaceMaterialGenerator`): The surface material generator: one schema for every kind, with presets for the common looks. Also `SURFACE_MATERIAL_KINDS`, `SURFACE_MATERIAL_OUTPUT`, `SURFACE_MATERIAL_SCHEMA`, `SurfaceMaterialKind`, `SurfaceMaterialMaps`, `SurfaceMaterialParams`, `SurfaceMaterialSpec`, `bakeSurfaceMaterial` and 3 more.
- `bakeSurfaceMaterialShared` (`@jgengine/core/material/surfaceMaterialTextures.draw`): Bake a surface material once per spec and detail level and share it: a world that names the same sand twice, or remounts its terrain, pays for one bake. Also `SurfaceMaterialArrayTextures`, `SurfaceMaterialStandardMaps`, `bakeSurfaceMaterialSharedJob`, `surfaceMaterialArrayTextures`, `surfaceMaterialStandardMaps`.
- `NatureSurface` (`@jgengine/core/nature/natureMesh`): Generated surface materials a nature mesh can be drawn with.
- `ResolvedTerrainSurfaceLayer` (`@jgengine/core/terrain/terrain`): One generated terrain surface with its tile metres and tint resolved. Also `ResolvedTerrainSurfaces`, `TerrainSurfaceRole`.
- `createTerrainSurfaceTextures` (`@jgengine/core/terrain/terrainDetailMaterial.draw`): Bake a terrain's generated surfaces (shared per spec) and stack them into array textures. Also `TerrainSurfaceSlot`, `TerrainSurfaceTextures`, `createTerrainSurfaceTexturesJob`.
- `TerrainSurfaceLayer` (`@jgengine/core/world/features`): One generated terrain surface: a material spec plus how it tiles and tints. Also `TerrainSurfacesConfig`.

### Changed

- Fernwild: grained beach sand with pebbles, grass and soil inland, cliff rock on slopes
