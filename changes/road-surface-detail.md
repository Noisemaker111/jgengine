### Added

- `createSurfaceRibbonMaterial`, `ribbonSurfaceFrame`, `resolvePathSurface` and `useSurfaceRibbonMaterial` (`@jgengine/shell/terrain`) shade ground ribbons with the terrain's procedural surface functions, plus wear and a noise-warped soft edge.
- `road({ surface })` (`@jgengine/core/world/features`) picks the carriageway surface; `false` keeps flat colour.
- `AuthoredScene`/`AuthoredPaths` `pathSurfaceDetail`/`surfaceDetail` props and path `meta.surface`, `meta.edgeSoftness`, `meta.wear`, `meta.surfaceDetail`.

### Changed

- Authored paths now render as dirt (or their `meta.surface`/kind) with wheel ruts and edges that fade into the terrain, instead of flat-colour ribbons with hard cut edges.
- `road()` carriageways, curbs, sidewalks and welded junctions, and city studio ground (streets, block land, sidewalks, drives, parks), shade with matching procedural asphalt, gravel, concrete and dirt. City volumes opt out with `meta.surfaceDetail: false`.
- Terrain noise and micro-normal GLSL moved to shared exports in `terrainSurfaceShader.ts` so terrain and ribbons compile the same code.
