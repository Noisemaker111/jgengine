the engine's built-in easy/standard/expert difficulty tiers; Harbor Heat and Drift Foundry keep theirs

Engine seam: packages/core/src/placement/buildPermissions.ts

### Migrate

- difficultyProfile(tiers, tier, overrides) takes the game's tier record; EncumbranceConfig.soft/floor, CarryableConfig.carryCapacity and createPlotPermissions ladder/editor/guildDefault are required

### Added

- plot permissions take an everyone role and a saved ban list; llmville's lab access (owner, owner's bot, visitors, bans) now runs on them

### Removed

- the engine's built-in easy/standard/expert difficulty tiers; Harbor Heat and Drift Foundry keep theirs
- the engine's built-in "common" drop rarity; a game sets content.defaultRarity or names a rarity per drop
- the engine's built-in 0.85 encumbrance band and 0.5 slow floor, and the carryable default of 8
- the fixed owner/editor/viewer build roles; a plot takes the game's own role ladder
