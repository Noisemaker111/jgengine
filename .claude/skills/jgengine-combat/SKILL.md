---
name: jgengine-combat
description: Compose targeting, stats, damage, effects, abilities, and rewards.
---

# JGengine combat

## Ownership

This skill owns combat resolution: target policy, combat stats, teams/factions as combat inputs, effects, damage/healing, projectiles, abilities, cooldowns, death/downed state, encounters, and reward/loot resolution. Movement and perception live in `jgengine-world`; inventory/economy state lives in `jgengine-gameplay`.

Search [capabilities.md](capabilities.md), then use [api.md](api.md) for signatures and [reference.md](reference.md) for complete pipelines.

Existing projects keep their resource state and follow the
[portable stat-pool recipe](recipes/portable-stat-pools.md). Adapt the caller's
store through `StatPoolAccess`; do not require `StatValueMap`, `GameContext`, or
a parallel entity store. To bolt firing onto an existing game, compose
`createWeaponRuntime` (cadence + magazine + the caller's own raycast + portable
`resolveDamageHit`) per the
[portable weapon-plumbing recipe](recipes/portable-weapon-plumbing.md); never add
a default gun or FPS kit.

Damage commitment accepts the same structural pool adapter while the matchup,
receiver, interceptor, and status stages remain pure. Follow the
[portable damage/effects recipe](recipes/portable-damage-effects.md) to compose
them over an existing store, clock, RNG, spatial index, and death flow.

Closure-backed magazines and stat modifiers expose plain snapshot/restore
state for caller-owned saves, rollback, replay, and workers. Follow the
[portable runtime-state recipe](recipes/portable-runtime-state.md); the caller
keeps its clock, reserve state, schema, and authority.

## Canonical pipeline

1. Acquire eligible candidates from a bounded spatial source.
2. Select a target through caller-owned policy and deterministic tie-breaking.
3. Validate costs, cooldowns, range, visibility, and authority.
4. Resolve typed effects through ordered, inspectable stages.
5. Apply damage/healing/status transitions and emit provenance-rich events.
6. Resolve death/downed and rewards separately from the hit itself.

Compose stages through registration/policy seams; adding a damage type, effect, target policy, or reward strategy must not add a central engine branch.

## Traps

- Stats are named caller data; the engine does not privilege genre attributes.
- Visual projectiles/VFX do not own authoritative hit resolution.
- Random rolls accept injected RNG and stable seeds.
- Interceptors record why values changed; hidden callbacks make outcomes unauditable.
- Reward generation and allocation are different operations, especially in multiplayer.
- Compose multiple loot pools with `createLootPipeline` (ordered stages, gates, fallbacks, roll modifiers, per-drop provenance) over `lootTable`; keep genre concepts (world/dedicated/boss/luck/pity) in game-space stages and modifiers, never in core.
- UI bars, reticles, and feedback route to `jgengine-ui`.
