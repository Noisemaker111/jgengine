quest, skill tree, talent, recipe and build permission gates are conditions the shared requirement part evaluates; harvest strikes use spatial/spatialIndex instead of their own grid

Refs #2817

Engine seam: packages/core/src/crafting/recipe.ts, packages/core/src/harvest/scatterHarvest.ts, packages/core/src/mission/quest.ts, packages/core/src/placement/buildPermissions.ts, packages/core/src/progression/skillTree.ts, packages/core/src/rules/predicate.ts, packages/core/src/talents/talents.ts, packages/core/src/worldModel/turfWar.ts

### Migrate

- TurfWarDecl.contestedGrip is required; pass the grip your blocks read as contested (the old value was 30)

### Added

- an includes comparator in rules/predicate, for a list fact that holds a value

### Fixed

- quest, skill tree, talent, recipe and build permission gates are conditions the shared requirement part evaluates; harvest strikes use spatial/spatialIndex instead of their own grid

### Removed

- turf war's built-in contested grip of 30; Harbor Heat passes its own
