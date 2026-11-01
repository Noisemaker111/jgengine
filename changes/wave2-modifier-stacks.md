received-damage, weather, vitals and decay modifiers are stat graphs; progression gates, standing requirements and loot filters are predicates

Engine seam: packages/core/src/combat/damage/receivedDamage.ts, packages/core/src/loot/lootFilter.ts, packages/core/src/progression/gates.ts, packages/core/src/progression/standing.ts, packages/core/src/progression/statGraph.ts, packages/core/src/progression/upgrades.ts, packages/core/src/rules/predicate.ts, packages/core/src/survival/decayMeter.ts and 1 more

### Added

- `evaluateStandingPredicate` (`@jgengine/core/progression/standing`): Evaluate a predicate over `standing.<trackId>` facts read from `reader` for one actor; an unknown track throws. Also `standingTracksRead`.
- `applyStatRate` (`@jgengine/core/progression/statGraph`): Scale one id's `rate` by a {@link StatRateModifier}; an omitted modifier leaves it unchanged. Also `StatRateModifier`.
- `predicateFloor` (`@jgengine/core/rules/predicate`): The `gte` floor a predicate sets on one fact path (the largest, when several), or `null` when it sets none — what a "needs 20 standing" line reads off an authored condition. Also `PredicateLeaf`, `predicateLeaves`.

### Changed

- Part of #2837

### Fixed

- received-damage, weather, vitals and decay modifiers are stat graphs; progression gates, standing requirements and loot filters are predicates

### Removed

- `@jgengine/core/loot/lootFilter` no longer exports `LootFilterCondition`.
- `@jgengine/core/progression/gates` no longer exports `GateMiss`, `GateRequirement`.
- `@jgengine/core/progression/standing` no longer exports `StandingRequirement`.
