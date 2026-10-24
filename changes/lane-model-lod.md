### Added

- `ModelConfig.variants` (`levels: [{ url, maxDistance? }]`, `hysteresis?`) declares ordered mesh detail levels for a model. The instanced prop path switches level per instance by distance to the camera, so near and far placements of one species keep their own mesh inside one batch cell. A model without `variants` draws exactly as before.
- `createModelVariantSelector` (`@jgengine/core/world/modelLod`) returns the level index for an id at a distance, carrying hysteresis across each boundary (`DEFAULT_VARIANT_HYSTERESIS`, 6 m). `lodBandIndex` is now exported from `@jgengine/core/world/lod` and both the LOD scheduler and the selector read distances through it, so simulation throttling and mesh detail cannot disagree.
- `syncStaticObjectSource` takes an optional `accept` predicate so one batch can split its instances between two instanced draws.
