### Added

- `ModelVariantConfig.shadows` (`@jgengine/core/world/modelLod`): a model variant level declares its own shadow participation as a plain field, `"inherit" | "cast" | "receive" | "both" | "none"`. `"inherit"`, the default, keeps the model's own `shadows`, so every existing model draws as before; a far level set to `"none"` leaves the shadow pass while still drawing its mesh.
- `ModelShadowMode` (`@jgengine/core/world/modelLod`) names the four-value shadow vocabulary, and `ModelConfig.shadows` uses it.
- `variantLevelModel` (`@jgengine/shell/render/singleVariantLod`) is the one place that resolves what a level draws and how it shadows; the single prop, batched prop and scatter paths all ask it, so a level's asset and its shadow answer cannot disagree.
