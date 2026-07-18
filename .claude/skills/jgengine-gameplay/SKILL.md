---
name: jgengine-gameplay
description: Compose serializable game state, systems, progression, and non-combat rules.
---

# JGengine gameplay

## Ownership

This skill owns non-combat rules and state: systems, catalogs, inventory/items, crafting, economy, quests, dialogue, social state, puzzles, survival, turns, tactics, sessions, and saveable game models. Combat math belongs to `jgengine-combat`; host persistence adapters belong to `jgengine-multiplayer`.

Use [capabilities.md](capabilities.md) for intent discovery, [api.md](api.md) for signatures, and [reference-systems.md](reference-systems.md) for scheduling details before hand-rolling a subsystem.

Existing projects can keep player state and saves behind `LevelingStatAccess`.
Follow the [portable XP/leveling recipe](recipes/portable-xp-leveling.md) for
custom stat ids, immutable store writes, multiple level events, and JSON resume.

## Canonical workflow

1. Define plain serializable state and stable ids.
2. Put definitions in typed catalogs; keep per-instance mutable state separate.
3. Express behavior as narrow systems or pure transitions with explicit inputs.
4. Route player/AI intent through commands; emit typed results/events.
5. Attach save/restore boundaries and versioning where state persists.
6. Bind UI through selectors/hooks rather than duplicating state.

Prefer `defineSystem` and `defineGame({ systems })` for scheduled capabilities. Keep boot/join in the game loop only when it is truly lifecycle glue. System ordering, frequency, and serialization are explicit; avoid a giant per-frame callback.

## Design rules

- Caller data owns nouns, formulas, tables, costs, tiers, and content.
- Pure-data operations are the reusable core; stateful conveniences wrap them.
- Transactions validate before mutation and return inspectable outcomes.
- Random selection accepts injected RNG and stable ordering.
- Large collections use indexes, queues, or bounded reconciliation rather than repeated scans.

## Traps

- A bare export mention is not an example; use capabilities for discovery and real imports/tests for adoption.
- Do not invent a parallel store when an existing game-context feature owns the state.
- Do not fuse save semantics with a specific cloud/backend adapter.
- Targeting, damage, effects, abilities, and loot resolution route to `jgengine-combat`.
- World movement/input/interaction route to `jgengine-world`; HUD rendering routes to `jgengine-ui`.
