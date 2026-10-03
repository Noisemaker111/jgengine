### Added

- Compose deterministic timed away missions with pure expedition dispatch, bounded offline settlement, finite supply consumption, death, item capacity, and safe return transitions (`@jgengine/core/work/expedition`). Caller-owned policy and content use a persisted RNG cursor and plain saveable state.
- Apply caller-authored elapsed-time loot curves with `timeScaledRarity` (`@jgengine/core/game/lootModifiers`), retaining original and effective odds in loot pipeline provenance.
