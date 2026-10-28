Scatter grows every tree from its own seed (`variants: "unique"`); Fernwild adopts it at the same frame cost

Engine seam: packages/core/src/generator/generator.ts, packages/core/src/plants/validation/plantSilhouette.ts, packages/core/src/scatter/InstancedScatter.draw.tsx, packages/core/src/scatter/ScatterHeroes.draw.tsx, packages/core/src/scatter/ScatterImpostorField.draw.tsx, packages/core/src/scatter/scatterGenerator.ts, packages/core/src/scatter/scatterHeroes.ts

### Added

- `generatorVariantFor` (`@jgengine/core/generator/generator`): The one variant of `base` that belongs to `key` (a placement id): its own seed, and params nudged by `explore` from a stream seeded by the key.
- `branchAzimuthHistogram` (`@jgengine/core/plants/validation/plantSilhouette`): Where a plant's main limbs point: the share of first-order branches whose first segment leaves the stem toward each of `bins` compass sectors, counter-clockwise from +x. Also `PlantSilhouetteFrame`, `PlantSilhouettes`, `histogramDistance`, `plantSilhouettes`, `silhouetteIoU`.
- `scatterPlacementVariant` (`@jgengine/core/scatter/scatterGenerator`): The variant one placement of a unique item grows as: its own seed and params, from the palette item and the placement id alone, so it regrows the same anywhere.
- `createScatterHeroSet` (`@jgengine/core/scatter/scatterHeroes`): A hero set for one species. Also `ScatterHeroMember`, `ScatterHeroSet`, `ScatterHeroSetOptions`, `ScatterHeroSetState`, `ScatterHeroUpdate`.
- `ScatterHeroesProps` (`@jgengine/core/scatter/ScatterHeroes.draw`): Props for {@link ScatterHeroes}.

- Scatter `variants: "unique"` grows every placement from its own seed. The nearest few (`heroes`, `heroDistance`, `heroDetail`) draw as their own mesh, grown in the plant workers; the rest draw as 4 shared stand-ins and their impostors.
- The plant-styles demo has a `unique` view: 100 sugar maples, each from its own seed.

### Changed

- Fernwild's trees are unique, at the same frame cost as before.
- A scatter impostor field keeps its far mesh when a few placements are hidden.

Part of #2699
