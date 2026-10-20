### Added

- Loaded GLB models get a default painted finish: flat-colour, vertex-colour and palette-atlas materials have their exported roughness/metalness/`envMapIntensity` normalized and compile with one shared object-space detail shader (mottling, wear, roughness break-up, micro-normal, cavity). Normal-mapped, cutout and transparent materials are untouched.
- `GraphicsProfile.surfaceDetail` (`"off" | "lite" | "full"`, `@jgengine/core/settings/graphicsProfile`): `"lite"` on low, `"full"` on medium and up.
- `ModelConfig.surfaceDetail: false` opts one model out; `defineGame({ surfaceDetail: false })` opts a game out.

### Changed

- A model `material.rim` override now chains the material's live program cache key instead of a snapshot.
