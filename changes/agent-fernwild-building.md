Fernwild gets ARK's building: thatch, wood and stone foundations, walls, doorframes, doors, ceilings, pillars and ramps that snap edge to edge, stand on the ground or each other, block movement, open and shut, take damage by tier and fall when what holds them up is gone. Number keys now equip what is in the hotbar, and a ridden raptor sprints at its own ratio. The engine gains snap base building, its renderer and a per-body sprint ratio.

Engine seam: packages/core/src/basebuilding/baseBuilding.ts, packages/core/src/basebuilding/BaseStructures.draw.tsx, packages/core/src/movement/playerMovement.ts and packages/core/src/scene/entityStore.ts (per-body runMultiplier)

Prevention: base-building tests (ground placement and slope limit, edge snaps for foundations, walls and ceilings, no two walls on one spot, wall stacking, a ray stopping at a wall, door swing, collapse when support goes, tier damage multipliers, snapshot/restore), a per-body sprint test in playerMovement, headless Fernwild tests (build a thatch hut whose walls block walking and whose door swings; fists break a wall and the roof falls; a placed campfire enables cooking); loop proof `bun run drive fernwild --flow fernwild-build`.

Bends: none.

### Added

- `createBaseBuilding` (`@jgengine/core/basebuilding/baseBuilding`): snap base building from data. Shapes are boxes with sockets; pieces pair a shape with a tier and health. Plans a piece at a cursor (snapping to the nearest free socket, or standing on the ground within a step limit), places, rotates through snap variants, toggles doors, damages by damage class per tier, removes and collapses whatever loses its path to the ground, raycasts, and hands back world boxes and collision solids; snapshot/restore.
- `BaseStructures` (`@jgengine/core/basebuilding/BaseStructures.draw`): draws placed pieces by colour, darkened as they lose health, and the build ghost tinted valid or blocked.
- `EntityMovement.runMultiplier`: a body's own sprint ratio, so a mount sprints at its species' ratio instead of the rider's.

### Fixed

- Fernwild's number keys never equipped anything: the hotbar inventory was not marked as the HUD hotbar and items had no use handler, so Digit keys fell through to the bag.
