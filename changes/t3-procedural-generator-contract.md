one generator contract for procedural systems: a typed param schema (defineParamSchema), a seeded pure generate step (defineGenerator, GeneratorContext), seeded variants (generatorVariants) and baked LOD variants (bakeGeneratorVariants), with a registry (registerGenerator)

Closes #2681

Engine seam: packages/core/src/buildings/buildingGenerator.ts, packages/core/src/city/cityContent.ts, packages/core/src/city/cityKind.ts, packages/core/src/editor/commandApply.ts, packages/core/src/editor/commands.ts, packages/core/src/editor/document.ts, packages/core/src/editor/entityCatalog.ts, packages/core/src/editor/movementCatalog.ts and 45 more

### Added

- one generator contract for procedural systems: a typed param schema (defineParamSchema), a seeded pure generate step (defineGenerator, GeneratorContext), seeded variants (generatorVariants) and baked LOD variants (bakeGeneratorVariants), with a registry (registerGenerator)
- param fields bound their variant exploration (explore windows, log-scale sizes, capped colour drift) so every variant stays plausible
- the editor shows a 20-tile variant grid under a generator's params (pick, keep, place, reroll), and RPC/MCP gets list_generators, generator_variants, apply_variant and place_variant
- grass runs on the contract, with putting green, fairway, savanna and dune presets, bare ground and mow stripes
- `BUILDING_GENERATOR` (`@jgengine/core/buildings/buildingGenerator`): The building parts generator.
- `bakeGeneratorVariants` (`@jgengine/core/generator/generator`): Bake N variants of a generator at each of its `lods` — the set an instanced renderer draws from (pick one per instance with {@link variantIndexAt}) and the editor's variant grid previews. Also `BakedGeneratorVariant`, `GeneratorContext`, `GeneratorDefinition`, `GeneratorOutput`, `GeneratorVariant`, `GeneratorVariantOptions`, `RunGeneratorOptions`, `defineGenerator` and 8 more.
- `getGeneratorPreview` (`@jgengine/core/generator/generatorPreview.draw`): The preview registered for an output family, or undefined when that family has none. Also `GeneratorPreview`, `GeneratorPreviewFrame`, `GeneratorPreviewProps`, `registerGeneratorPreview`.
- `GeneratorVariantGrid` (`@jgengine/core/generator/GeneratorVariantGrid.draw`): A grid of seeded generator variants, each drawn live in its own tile. Also `GeneratorVariantGridProps`.
- `childParamGroups` (`@jgengine/core/generator/paramSchema`): The groups nested directly under `parent` (top-level groups when `parent` is undefined), in declared order. Also `ActionParamField`, `BoolParamField`, `ColorExplore`, `ColorParamField`, `CurveParamField`, `CurvePoint`, `GradientParamField`, `GradientStop` and 21 more.
- `createGrassTuftTemplate` (`@jgengine/core/grass/grassField`): Build the shared tuft template for a patch. Also `GrassTemplateLod`, `GrassTuftInputs`, `GrassTuftTemplate`, `grassBareAt`, `grassFieldNoise`.
- `GRASS_FIELD_OUTPUT` (`@jgengine/core/grass/grassKind`): The generator output family a grass look bakes to: {@link GrassFieldBake}. Also `GRASS_GENERATOR`, `GrassFieldBake`.
- `PARTS_OUTPUT` (`@jgengine/core/scene/assetGenerator`): The output family of a generator that returns {@link GeneratedAsset} parts. Also `isGeneratedAsset`, `partsGeneratorFor`.
- `GRASS_FIELD_OUTPUT` (`@jgengine/core/world`): The generator output family a grass look bakes to: {@link GrassFieldBake}. Also `BakedGeneratorVariant`, `CurvePoint`, `GRASS_GENERATOR`, `GRASS_PRESETS`, `GeneratorContext`, `GeneratorDefinition`, `GeneratorVariant`, `GeneratorVariantOptions` and 18 more.

### Fixed

- short grass (greens, fairways) showed no blades because the turf mat floated above them; the mat now sits under the blades and carries fine blade grain and normal detail up close
- a small grass patch with no mow stripes lost its whole mat to the edge feather

### Removed

- `@jgengine/core/grass/grassBake.draw` no longer exports `GrassTemplateLod`, `GrassTuftTemplate`, `createGrassTuftTemplate`.
- `@jgengine/core/scene/assetGenerator` no longer exports `AssetGeneratorDefinition`, `registerAssetGenerator`.
- `@jgengine/core/scene/sceneKinds` no longer exports `ActionParamField`, `BoolParamField`, `ColorParamField`, `NumberParamField`, `ParamField`, `ParamGroup`, `ParamIssue`, `ParamPreset` and 10 more.
- `@jgengine/core/world` no longer exports `registerAssetGenerator`.
