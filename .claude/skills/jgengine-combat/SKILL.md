---
name: jgengine-combat
description: Compose targeting, stats, damage, effects, abilities, and rewards.
---

# JGengine combat

## Ownership

This skill owns combat resolution: target policy, combat stats, teams/factions as combat inputs, effects, damage/healing, projectiles, abilities, cooldowns, death/downed state, encounters, and reward/loot resolution. Movement and perception live in `jgengine-world`; inventory/economy state lives in `jgengine-gameplay`.

Search [capabilities.md](capabilities.md), then use [api.md](api.md) for signatures and [reference.md](reference.md) for complete pipelines.

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
- UI bars, reticles, and feedback route to `jgengine-ui`.

