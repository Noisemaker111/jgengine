plant.grown, a generator that grows a plant species to any age and day, then meshes it at four detail levels with fixed triangle budgets (120k, 30k, 8k, 1.5k)

Engine seam: packages/core/src/generator/generator.ts, packages/core/src/material/toonRamp.draw.ts, packages/core/src/material/toonRamp.ts, packages/core/src/nature/natureGenerators.ts, packages/core/src/plants/cache/plantCache.ts, packages/core/src/plants/cache/plantCodec.ts, packages/core/src/plants/grown/plantGrown.draw.tsx, packages/core/src/plants/grown/plantGrown.ts and 9 more

### Migrate

- BROADLEAF_GENERATOR, BROADLEAF_SCHEMA, CONIFER_GENERATOR and CONIFER_SCHEMA are gone; map a scatter item to { generator: "plant.grown", params: { species, age, ...look } } instead

### Added

- plant.grown, a generator that grows a plant species to any age and day, then meshes it at four detail levels with fixed triangle budgets (120k, 30k, 8k, 1.5k)
- a style layer on plant.grown (leaves or clumps, tints, saturation, paint, lit or cel-ramp shading, bark grain) that restyles without regrowing; the engine names no styles
- grown structures and meshes are cached in memory and in IndexedDB through an injected PlantCacheStorage, so a cached plant returns in under 5 ms
- an optional async prepare step on GeneratorDefinition (prepareGenerator, prepareGeneratorVariants); the scatter field runs it as scene loading before it bakes
- toonRampMaterial, a cel-shading ramp material part in material/
- eastern white pine (pinus-strobus), fit to the Carmean NC-128 site-index curve within 15% at 50 and 100 years; evergreen foliage no longer turns in autumn
- a plant-styles dev demo with one maple and one pine in realistic, toon and clay looks from one structure
- `prepareGenerator` (`@jgengine/core/generator/generator`): Await a generator's `prepare` for the output {@link runGenerator} would return with the same arguments. Also `prepareGeneratorVariants`.
- `TOON_RAMP_TEXELS` (`@jgengine/core/material/toonRamp`): Texels across a ramp texture: enough for 8 bands with blended edges. Also `ToonRamp`.
- `toonRampMaterial` (`@jgengine/core/material/toonRamp.draw`): A shared vertex-coloured toon material for a ramp: one per distinct ramp, so every mesh drawn with the same look batches into the same program.
- `createIndexedDbPlantCacheStorage` (`@jgengine/core/plants/cache/plantCache`): A storage over the browser's IndexedDB, or null where there is none (bun, node, a locked-down frame). Also `CachedPlantStructure`, `PlantCache`, `PlantCacheOptions`, `PlantCacheState`, `PlantCacheStorage`, `createMemoryPlantCacheStorage`, `createPlantCache`.
- `decodePlantMesh` (`@jgengine/core/plants/cache/plantCodec`): The mesh {@link encodePlantMesh} wrote. Also `decodePlantStructure`, `encodePlantMesh`, `encodePlantStructure`.
- `BUILTIN_PLANT_SPECIES` (`@jgengine/core/plants/grown/plantGrown`): Species the engine ships, registered with {@link registerPlantGenerators}. Also `PLANT_CACHE`, `PLANT_GROWN_GENERATOR`, `PLANT_GROWN_SCHEMA`, `PLANT_MESH_OUTPUT`, `createPlantGrownGenerator`, `plantStructureKey`, `plantStyleOf`.
- `DEFAULT_PLANT_STYLE` (`@jgengine/core/plants/mesh/plantMesh`): The style a plant gets when none is given: the species' own colours, lit, with real leaves. Also `PLANT_MESH_LODS`, `PLANT_MESH_TRIANGLE_BUDGETS`, `PlantMesh`, `PlantMeshInput`, `PlantMeshLook`, `PlantStyle`, `buildPlantMesh`, `isPlantMesh` and 1 more.
- `plantMeshMaterials` (`@jgengine/core/plants/mesh/plantMesh.draw`): The shared materials a plant mesh's wood and foliage draw with for its look: lit vertex colour (with generated bark grain when asked) or one cel-shading ramp for both. Also `plantMeshSources`.
- `PINUS_STROBUS` (`@jgengine/core/plants/species/data/pinusStrobus`): Eastern white pine.
- `EASTERN_WHITE_PINE_CARMEAN` (`@jgengine/core/plants/validation/heightAgeCurves`): NC-128 curve 103: eastern white pine, northern Wisconsin (FVS `htcalc.f`), total age.

### Changed

- Fernwild's broadleaf trees, pines, redwoods and dead trees are grown maples and pines; only its palette entries changed
- Fernwild's load baseline is re-recorded: a first visit grows 28 tree variants (about 2 s of main-thread work); later visits read them from IndexedDB
- Part of #2699

### Removed

- the nature.broadleaf and nature.conifer generators with their schemas and presets
- `@jgengine/core/nature/natureGenerators` no longer exports `BROADLEAF_GENERATOR`, `BROADLEAF_SCHEMA`, `CONIFER_GENERATOR`, `CONIFER_SCHEMA`.
- `@jgengine/core/world` no longer exports `BROADLEAF_GENERATOR`, `BROADLEAF_SCHEMA`, `CONIFER_GENERATOR`, `CONIFER_SCHEMA`.
