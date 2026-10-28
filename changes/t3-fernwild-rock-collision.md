sceneScatterSolids (AuthoredScene scatterSolids) makes a scatter palette item solid: each placement blocks the player, NPCs and physics with a box of the given radius and height, and stops blocking once mined out

Refs #2687

Engine seam: packages/core/src/scatter/scatterSolids.ts, packages/core/src/scene/AuthoredScene.draw.tsx, packages/shell/src/defineGame.tsx

### Added

- sceneScatterSolids (AuthoredScene scatterSolids) makes a scatter palette item solid: each placement blocks the player, NPCs and physics with a box of the given radius and height, and stops blocking once mined out
- `SCATTER_SOLID_LAYER` (`@jgengine/core/scatter/scatterSolids`): Layer {@link syncScatterSolids} owns in `ctx.world.solids`. Also `ScatterSolidSpec`, `scatterSolids`, `syncScatterSolids`.

### Changed

- Fernwild's rocks, boulders and ore rocks are solid: the survivor walks around them instead of through them, as in ARK
