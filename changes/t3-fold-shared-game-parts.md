cards/modifierPipeline, a second modifier stack no game used; statGraph is the one way to stack add, multiply, override and clamp

Refs #2817

Engine seam: packages/core/src/cards/modifierPipeline.ts, packages/core/src/gameplay.ts, packages/core/src/inventory/encumbrance.ts, packages/core/src/item/affix.ts, packages/core/src/loot/lootGen.ts, packages/core/src/loot/lootPipeline.ts, packages/core/src/movement/movementSpeed.ts, packages/core/src/progression/statGraph.ts

### Migrate

- runPipeline is gone; use foldStatContributions or a statGraph

### Added

- statGraph foldStatContributions, applyStatOp and boundStatValue for plain ordered value stacks
- `applyStatOp` (`@jgengine/core/progression/statGraph`): Apply one {@link StatOp} to a running value — the engine's one definition of what add, multiply, override and clamp mean. Also `StatBounds`, `boundStatValue`, `foldStatContributions`.

### Fixed

- affixes, loot stats and walk speed stack through statGraph; encumbrance tiers use tierAt; loot plans and Scrap Signal's rarity roll use pickWeighted

### Removed

- cards/modifierPipeline, a second modifier stack no game used; statGraph is the one way to stack add, multiply, override and clamp
- `@jgengine/core/cards/modifierPipeline` no longer exports `Modifier`, `ModifierPipeline`, `PipelineContext`, `PipelineResult`, `TraceStep`, `createModifierPipeline`, `runPipeline`.
- `@jgengine/core/gameplay` no longer exports `runPipeline`.
