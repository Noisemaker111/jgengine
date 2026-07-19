---
name: jgengine
description: Route game work to the smallest useful JGengine guidance set.
---

# JGengine intake and router

Read the JGengine README for package truth, commands, layering, and license — the repo-root [`README.md`](../../../README.md) in the monorepo, or [jgengine.com](https://jgengine.com) from a scaffolded consumer project (where the relative link does not resolve). This skill decides what to load; it is not an engine manual.

## 1. Establish the target

Treat the pitch as a unique composition of needs, not a genre to fill in — never reach for a genre kit, preset, archetype, or class template ("default sports car", "default RPG", "default FPS") in the SDK or skills (see [AGENTS.md](../../../AGENTS.md)). Use `game-design` to turn the pitch into a testable player promise, verbs, loops, progression, failure, and completion scenario. Use `level-design` when play depends on authored spaces, routes, encounters, exploration, or spatial pacing. Capture only decisions that change architecture:

- player point of view and controls
- world shape and authored content
- core loop, interaction, combat, and progression
- solo, local, hosted, or persistent multiplayer
- HUD/menu states and **custom** UI art direction (every game owns its presentation — no stock drop-in face)
- one observable completion scenario

For a new in-repo game, scaffold with `bun run new:game "<id-or-title>"` (thin script alias for `jgengine create`, auto-detects the in-repo variant). Outside this monorepo, start with `npx jgengine create`; never copy `Games/*`.

For an existing game asked to pick up a new engine release ("jgengine published a new version, grab it"), run `npx jgengine upgrade` in the project first: it diffs installed `@jgengine/*` versions against the latest release and prints every Migrate step and Adopt-worthy addition in between (`--json` for structured output). Bump, migrate oldest-first, then work the Adopt lists instead of reconstructing the changelog by hand.

## 2. Select domains

Load only rows the target needs. Do not preload every domain.

| Need | Skill | Owner |
| --- | --- | --- |
| player promise, pillars, verbs, loops, economy, progression, balance | `game-design` | experience and rule intent |
| metrics, topology, encounters, navigation, spatial pacing | `level-design` | playable space intent |
| scene placement, terrain painting, paths, asset authoring | `jgengine-editor` | editor document and authoring tools |
| runtime world, movement, input, interaction, AI, navigation, audio | `jgengine-world` | spatial simulation and world runtime |
| game state, systems, inventory, crafting, quests, economy, turns | `jgengine-gameplay` | non-combat rules and state |
| targeting, stats, damage, effects, abilities, projectiles, loot | `jgengine-combat` | combat resolution |
| HUD, menus, layout, accessibility, touch presentation | `jgengine-ui` | player-facing interface |
| models, sprites, materials, audio files, source licensing | `jgengine-assets` | asset discovery and catalogs |
| authority, transport, replication, sessions, host persistence | `jgengine-multiplayer` | network topology and persistence adapters |

World content routes editor-first: any request that adds, moves, restyles, or removes something visible in the world — however phrased ("design this world", "place the enemies", "make it look better") — starts in `jgengine-editor`; the other domains consume the authored document. Scenes normally require both `jgengine-editor` for authoring and `jgengine-world` for runtime consumption. Combat and multiplayer are opt-in, not default intake.

## 3. Discover before designing

Within each selected domain:

0. Fastest start for a common composition: `npx jgengine recipe <name>` prints a vetted, SDK-typechecked snippet (imports + wired code) for `combat-loop`, `boss-telegraph`, `loot`, `quest`, `coop-presence`, `third-person-camera`; `npx jgengine recipe` lists them. Copy that instead of reconning per-file.
1. Search `capabilities.md` by intent; it maps needs to imports. Outside the monorepo (or before a domain skill is even loaded), `npx jgengine find <intent>` greps every shipped capability index at once and prints the primitive + import — reach for it the moment you're tempted to hand-roll a HUD window, inventory grid, paperdoll, hotkey listener, minimap, stat bar, or character motion. If you're writing a `z-index`, a `keydown` for a panel, a `<div>` inventory, or a limb bob, a shipped drop-in almost certainly exists (`usePanels`/`PanelHost`, `InventoryGrid`, `CharacterSheet`/`Paperdoll`, `PartMotionRig`, `EntityPreview`); games own the *skin*, not the re-derivation.
2. Open `api.md` only when exact signatures or export inventory are needed.
3. Open the linked reference only for a deeper recipe or trap.
4. For how several primitives wire into a running loop, read the domain's `recipes/` — connected, genre-free walkthroughs organized by composition seam; this skill's own [recipes/minimal-game.md](recipes/minimal-game.md) is the default whole-game walkthrough. Prefer a recipe over reading a game's source; the games under `Games/*` are not templates or references, and a hybrid game is just a different composition of the same primitives.

If no capability fits, identify the upstream package seam before writing game-local code. In this repository, implement a reusable primitive with its first adopter; if editor-owned content cannot be expressed, file the editor gap first.

## 4. Build and finish

Keep scene coordinates in the editor document, state serializable, randomness injected, and hot-path work bounded. Use `jgengine-verify` for evidence appropriate to the change. Inside this monorepo, `workflow` owns issue/PR completion. Visual polish work also uses the `jgengine-ui` quality reference.
