plants draw leaf cards with a leaf atlas baked per leaf shape, at the mid and low detail levels

Engine seam: packages/core/src/generator/generator.ts, packages/core/src/plants/cache/plantCodec.ts, packages/core/src/plants/grown/plantGrowPool.ts, packages/core/src/plants/grown/plantGrowWorker.ts, packages/core/src/plants/grown/plantGrown.ts, packages/core/src/plants/mesh/plantLeafAtlas.ts, packages/core/src/plants/mesh/plantMesh.draw.ts, packages/core/src/plants/mesh/plantMesh.ts

### Added

- plants draw leaf cards with a leaf atlas baked per leaf shape, at the mid and low detail levels
- plant growth, meshing and atlas baking run in a worker pool, so a first visit to Fernwild spends about 64 ms of main-thread time on plants instead of about 2.2 s
- `PlantGrownGeneratorOptions` (`@jgengine/core/plants/grown/plantGrown`): Options for {@link createPlantGrownGenerator}.
- `createWorkerPlantGrower` (`@jgengine/core/plants/grown/plantGrowPool`): A pool of workers that grow plants with the same simulation as the main thread, so a first visit grows a forest without spending frame time. Also `PlantGrowRequest`, `PlantGrowResult`, `PlantGrower`, `PlantMeshOrder`, `WorkerPlantGrowerOptions`.
- `PLANT_LEAF_ATLAS_CELLS` (`@jgengine/core/plants/mesh/plantLeafAtlas`): Cells of a {@link PlantLeafAtlas}, left to right: one leaf, a leafy shoot, a crown cluster. Also `PLANT_LEAF_ATLAS_CELL_COUNT`, `PlantLeafAtlas`, `bakePlantLeafAtlas`, `plantLeafAtlas`, `plantLeafAtlasKey`.

### Changed

- prepareGeneratorVariants prepares every variant at the same time
- Fernwild's trees use leaf cards
- Part of #2699

### Removed

- `@jgengine/core/camera/firstPersonBody.draw` no longer exports `keepHeadUnderEye`.
- `@jgengine/core/plants/validation/crownAllometry` no longer exports `CrownProfile`, `CrownWidthClass`, `CrownWidthEquations`, `EASTERN_WHITE_PINE_CROWN_WIDTH`, `SUGAR_MAPLE_CROWN_WIDTH`, `TALLO_CROWN_WIDTH`, `crownProfile`, `forestGrownCrownWidthM` and 2 more.
