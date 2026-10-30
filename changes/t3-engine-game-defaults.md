the engine's built-in easy/standard/expert difficulty tiers; Harbor Heat and Drift Foundry keep theirs

Engine seam: packages/core/src/ai/difficulty.ts, packages/core/src/inventory/carryLoad.ts, packages/core/src/inventory/encumbrance.ts, packages/core/src/loot/groundItem.ts, packages/core/src/loot/haul.ts, packages/core/src/physics/carryable.ts, packages/core/src/placement/buildPermissions.ts, packages/core/src/runtime/context/deathLoot.ts and 4 more

### Migrate

- difficultyProfile(tiers, tier, overrides) takes the game's tier record; EncumbranceConfig.soft/floor, CarryableConfig.carryCapacity and createPlotPermissions ladder/editor/guildDefault are required

### Added

- `BuildRoleLadder` (`@jgengine/core/placement/buildPermissions`): The roles one game's build plots use, from fewest build rights to most, and which role carries which right.
- `BuildRoleLadder` (`@jgengine/core/world`): The roles one game's build plots use, from fewest build rights to most, and which role carries which right.

### Removed

- the engine's built-in easy/standard/expert difficulty tiers; Harbor Heat and Drift Foundry keep theirs
- the engine's built-in "common" drop rarity; a game sets content.defaultRarity or names a rarity per drop
- the engine's built-in 0.85 encumbrance band and 0.5 slow floor, and the carryable default of 8
- the fixed owner/editor/viewer build roles; a plot takes the game's own role ladder
- `@jgengine/core/ai/difficulty` no longer exports `DIFFICULTY_TIERS`, `DifficultyTier`.
- `@jgengine/core/loot/groundItem` no longer exports `DEFAULT_RARITY`.
- `@jgengine/core/placement/buildPermissions` no longer exports `BuildRole`.
- `@jgengine/core/world` no longer exports `BuildRole`.
