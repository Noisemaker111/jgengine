---
name: jgengine-world
description: Build spatial runtime, movement, interaction, AI, and environments.
---

# JGengine world runtime

## Ownership

This skill owns runtime spatial behavior: authored-scene consumption, environments, movement, input mapping, interaction, AI, navigation, physics, visibility, time, and spatial audio. Scene creation and placement stay in `jgengine-editor`; presentation stays in `jgengine-ui`.

Search [capabilities.md](capabilities.md) by intent before designing a primitive. Use [api.md](api.md) for exact exports and [reference.md](reference.md) for environment, camera, navigation, physics, audio, and authored-scene recipes.

## Canonical workflows

### Authored world

1. Load the scene document through the shared authored-scene feature.
2. Render objects, paths, terrain, foliage, and markers generically.
3. Query the same ids/layers for spawns, routes, plots, and interaction.
4. Keep derived caches rebuildable; the document remains authoritative.

### Movement and interaction

Choose input intent, controller/motor, collision/navigation, and camera as separate seams. Commands express game intent; world systems resolve motion. Interaction targets come from bounded spatial/sensor queries, not full-world scans.

### AI and navigation

Compose perception, selection, planning/behavior, movement, and lifecycle independently. Inject randomness and scheduling. Use spatial indexes, interest tiers, or bounded candidate sets for scale.

## Traps

- Do not put UI layout, touch chrome, combat resolution, or asset acquisition here.
- Do not duplicate editor coordinates in runtime state.
- Public APIs accept semantic policies and caller data, not renderer mechanics or internal tuning rolls.
- Generated environments still need deterministic data assertions; authored environments need scene-document assertions.
- Audio files and licensing belong to `jgengine-assets`; spatial playback policy belongs here.

