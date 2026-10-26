Terrain has one home per layer. The terrain model (height fields, sculpting, path carving, contour guides, grade limits and the paint presets) now lives in `packages/core/src/terrain/`, beside the drawing code in `packages/shell/src/terrain/`. The two different things both called `TerrainMaterial` are now distinct: `TerrainMaterial` is the named ground palette (`"grass"`, `"sand"`, …) and the editor's paint swatches are `TerrainPaintPreset`.

### Changed

- Moved to `@jgengine/core/terrain/`: `terrain` (was `world/terrain`), `terraform` (was `world/terraform`), `pathTerrain` (was `world/pathTerrain`), `terrainGuides` (was `world/terrainGuides`), `terrainGrade` (was `movement/terrainGrade`), and `terrainPaint` (was `editor/terrainMaterials`).
- `terrainGroundColorSampler` moved to `@jgengine/shell/terrain/terrainGroundColor` (was `environment/terrainGroundColor`).
- The editor's paint palette is `TerrainPaintPreset` / `TERRAIN_PAINT_PRESETS` / `TERRAIN_PAINT_COLORS` (was `TerrainMaterial` / `TERRAIN_MATERIALS` / `TERRAIN_MATERIAL_COLORS`), imported from `@jgengine/core/terrain/terrainPaint`. `@jgengine/core/editor` and `@jgengine/editor` no longer re-export it.
- Every importer in packages, apps and games points at the new paths. The terrain and road shader work from #2544 (shared noise texture, height-grid ground mesh, grouped warmup) is untouched; only import paths changed.

### Removed

- The duplicate `TerrainMaterial` export in `editor/terrainMaterials`.

Bends:
- `map/terrainMap` (bakes a top-down map image) stays with the map concept; `shell/src/terrain.ts` stays as the package's `@jgengine/shell/terrain` entry.
- Moved files count as new exports, so 19 terrain and terraform symbols that had no doc line got one.

Verification:
- `bun run check types`, `bun run gen` (all stages), `bun run check concept-homes --all` (0 duplicates), `bun test packages/core/src packages/shell/src packages/editor/src apps/web/src scripts` (11223 pass, 0 fail).
- `jgengine find terrain` names one core folder (`packages/core/src/terrain/`) and one shell folder.
- Standalone editor: created a terrain, the Paint tab lists all eight presets, a grass stroke paints the ground.
- Play shots of Beacon Bastion, Harbor Heat, Odd Orbit, Scrap Signal and Fernwild render as before; load guard passes for all five (Harbor Heat failed once while the full test suite ran beside it, then passed alone).
