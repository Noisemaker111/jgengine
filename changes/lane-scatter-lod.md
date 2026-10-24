### Added

- `InstancedScatter` now honours `ModelConfig.variants`: each species-chunk batch asks the same `createModelVariantSelector` the static prop path uses for every placement's level, and each level draws its own instanced meshes claiming only its placements. A chunk that holds near and far palms of one species draws both levels from the one batch; a model without `variants` draws exactly as before.
- `writeScatterVariantLevel` (`@jgengine/shell` internal, `scatter/scatterVariants`) is the per-frame pass: it writes one level's composed matrices into a reserved slot array and returns `count`, allocating nothing per frame, and takes an optional `keep` predicate so a tier-distance or occlusion cull composes with level selection in one loop.
