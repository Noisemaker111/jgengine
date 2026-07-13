# Pre-1.0 API reset

This repository is in a pre-adoption phase. API quality takes priority over preserving accidental public shapes.

## Immediate direction

- New game code starts from `@jgengine/core/authoring`.
- Skills and tutorials teach tasks, not repository paths.
- Infrastructure modules remain available for engine and adapter work but are not the default game-authoring surface.
- Leaky APIs are renamed or replaced directly; repository-owned games migrate in the same PR.
- Semantic object arguments replace positional implementation parameters.
- Randomness and time remain injectable for deterministic simulation.

## Domain migration targets

### Game and runtime

Game authors define games, loops, saves, and multiplayer intent. They do not construct context, stores, snapshots, or transports unless implementing infrastructure.

### Scene

Game authors spawn, query, move, and remove entities. Entity-store ownership and indexing remain internal.

### World

Game authors describe terrain, structures, weather, roads, and placement. Environment summaries and generation bookkeeping are verification and tooling details.

### Movement and navigation

Game authors choose movement mode, destinations, constraints, and avoidance. Movement models, nav state, and integration details remain behind semantic configuration.

### Combat and gameplay

Game authors define damage, resources, effects, items, quests, and objectives. Primitive state machines remain available for custom systems but are not the first documented route.

### Multiplayer

Game authors choose topology, authority, synchronized concepts, and persistence. Pose gates, codecs, transport packets, and reconciliation internals remain infrastructure.

### UI

Game authors define HUD information and interaction affordances. React providers and subscription plumbing remain adapter-level concepts.

## Completion rule

A domain is migrated only when its public entry point, examples, skill guidance, generated reference descriptions, and repository-owned call sites all use the semantic surface.
