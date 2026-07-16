---
name: jgengine
description: Route game work to the smallest useful JGengine guidance set.
---

# JGengine intake and router

Read the repository [README](../../../README.md) for package truth, commands, layering, and license. This skill decides what to load; it is not an engine manual.

## 1. Establish the target

Capture only decisions that change architecture:

- player point of view and controls
- world shape and authored content
- core loop, interaction, combat, and progression
- solo, local, hosted, or persistent multiplayer
- HUD/menu states and art direction
- one observable completion scenario

For a new in-repo game, scaffold with `bun run new:game <id> --name "Title"`. Outside this monorepo, start with `npx jgengine create`; never copy `Games/*`.

## 2. Select domains

Load only rows the target needs. Do not preload every domain.

| Need | Skill | Owner |
| --- | --- | --- |
| scene placement, terrain painting, paths, asset authoring | `jgengine-editor` | editor document and authoring tools |
| runtime world, movement, input, interaction, AI, navigation, audio | `jgengine-world` | spatial simulation and world runtime |
| game state, systems, inventory, crafting, quests, economy, turns | `jgengine-gameplay` | non-combat rules and state |
| targeting, stats, damage, effects, abilities, projectiles, loot | `jgengine-combat` | combat resolution |
| HUD, menus, layout, accessibility, touch presentation | `jgengine-ui` | player-facing interface |
| models, sprites, materials, audio files, source licensing | `jgengine-assets` | asset discovery and catalogs |
| authority, transport, replication, sessions, host persistence | `jgengine-multiplayer` | network topology and persistence adapters |

Scenes normally require both `jgengine-editor` for authoring and `jgengine-world` for runtime consumption. Combat and multiplayer are opt-in, not default intake.

## 3. Discover before designing

Within each selected domain:

1. Search `capabilities.md` by intent; it maps needs to imports.
2. Open `api.md` only when exact signatures or export inventory are needed.
3. Open the linked reference only for a deeper recipe or trap.

If no capability fits, identify the upstream package seam before writing game-local code. In this repository, implement a reusable primitive with its first adopter; if editor-owned content cannot be expressed, file the editor gap first.

## 4. Build and finish

Keep scene coordinates in the editor document, state serializable, randomness injected, and hot-path work bounded. Use `jgengine-verify` for evidence appropriate to the change. Inside this monorepo, `workflow` owns issue/PR completion. Visual polish work also uses the `jgengine-ui` quality reference.
