static content stops paying per-frame matrix and draw cost: static matrices, batched props, HLOD per cell, on-demand capture and precompile off the critical path

Engine seam: packages/core/src/input/pointerService.draw.ts, packages/core/src/instancing/StaticObjectModels.draw.tsx, packages/core/src/instancing/cellProxy.draw.ts, packages/core/src/instancing/staticDrawPool.draw.ts, packages/core/src/instancing/staticObjectBatches.draw.ts, packages/core/src/lighting/CascadedShadows.draw.tsx, packages/core/src/material/compileLayers.draw.ts, packages/core/src/material/wetSurfaces.draw.ts and 9 more

### Added

- `refreshStaticTransforms` (`@jgengine/core/model/staticTransforms.draw`): Re-bake a frozen subtree's world matrices from its current position, rotation and scale, and its parent's world matrix: the one-off update for static content something moved (a door swung, a placement edited).
- `HlodConfig` (`@jgengine/core/visibility/config`): Far static cells draw one merged proxy instead of their props.

### Changed

- Part of #2837

### Fixed

- static content stops paying per-frame matrix and draw cost: static matrices, batched props, HLOD per cell, on-demand capture and precompile off the critical path
