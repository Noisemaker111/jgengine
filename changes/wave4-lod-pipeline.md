Build-time mesh levels, baked impostors and one asset pipeline command

Part of #2837

### Added

- `bun run games:provision build <game>` runs a game's asset pipeline in one call: provision, KTX2 texture twins, simplified mesh levels and baked impostor atlases for the model files its `jgengine.json` `assetBuild` names. Cached by content, at most 4 workers, idle priority; `--no-impostors` and `--textures-only` narrow it.
- `buildModelLods` (`@jgengine/assets`) writes `<file>.lods/` beside a model: geometry-only levels that keep each material's source index, an optional impostor atlas, and `meta.json`.
- `visibility.meshLods: { screenSizes, hysteresis?, impostorDistance? }` switches props and scatter to the built levels by size on screen, and big props to baked impostor cards past a distance. `ModelConfig.meshLods` overrides it per model; `false` turns it off. Off unless set; a model with no built files draws as before.
- `ModelVariantLodConfig` takes `hysteresisRatio` and `scaleWithInstance`.
- Harbor Heat builds levels for its library props and trees and bakes impostors for its jacaranda and quiver trees; Fernwild builds levels for its grass, flowers, plants, mushrooms and ore rocks.

### Fixed

- A far HLOD cell no longer draws a proxy and impostor cards for the same prop, and its proxy holds only a model's coarsest level instead of every level.
