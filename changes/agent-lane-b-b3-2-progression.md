### Added

- `defineXpCurve` (`@jgengine/core/gameplay`) resolves one authored growth rule (`flat`, `linear`, `power`, `geometric`, `table`) plus a `maxLevel` cap into per-level thresholds, lifetime totals, a plain-words rule string and a `leveling` track.
- `createSkillTree` spends and refunds points over authored nodes with `cost`, `requires`, `excludes`, passives, actives and multi-node `synergies`; `resolved()` returns the stat modifiers and actions, and state snapshots/restores as `{ points, ranks }`.
- `gearScore` / `compareGearSets` score a whole loadout from stat weights, level, rarity and slot coverage.
- `lootStatContributions` and `scoreLootStats` expose the weight policy `compareLootItems` already used.
