---
name: jgengine
description: Route game work to the smallest useful JGengine guidance set.
---

# JGengine router

JGengine is a TypeScript SDK of small general systems that combine into any game. Rules live in [AGENTS.md](../../../AGENTS.md); packages, layering and commands in [README.md](../../../README.md) (jgengine.com from a created project). Load only the domain a task needs.

A created project ships `jgengine`, `create-game-jg`, `jgengine-editor`, `jgengine-verify`, `game-design` and `jgengine-ui`; `npx jgengine skills -p --all` adds the rest, with no `api.md` (read `node_modules/@jgengine/<pkg>/dist/*.d.ts`). Upgrading a project, `doctor` and `sync`: `jgengine-editor`.

## Start

A new game or big feature starts with `create-game-jg`: it owns the create flow, `PLAN.md` and milestones. Never copy `games/*` or reach for a genre kit or preset. Pitch to testable promise: `game-design`; authored spaces and encounters: `level-design`.

## The parts

Break every feature into these before looking anything up: "supply drop" is a Schedule, Placement, Ladder, Requirement, Table and Motion track. One home each; `@jgengine/core/parts` re-exports their model layers.

| Part | Home |
| --- | --- |
| Meter | `stats/statPool.ts` |
| Ladder | `threshold/thresholds.ts` |
| Phases | `time/stateSchedule.ts` |
| Schedule | `time/pacedSchedule.ts` |
| Slots | `time/refillSlots.ts` |
| Placement | `world/spatialSample.ts`, `game/spawnPoints.ts` |
| Table | `random/pick.ts` |
| Requirement | `rules/predicate.ts` |
| Modifiers | `progression/statGraph.ts` |
| Inheritance | `inheritance/inheritance.ts` |
| Motion track | `movement/motionTrack.ts` |

The cookbook shows each common feature built from these in a few lines: [recipes/cookbook.md](recipes/cookbook.md).

## Domains

| Load | When |
| --- | --- |
| `jgengine-editor` | anything visible in the world: placement, terrain, paths, assets; project upgrades |
| `jgengine-world` | runtime movement, input, interaction, AI, navigation, audio |
| `jgengine-gameplay` | state, systems, inventory, crafting, quests, economy, turns |
| `jgengine-combat` | targeting, stats, damage, effects, abilities, loot |
| `jgengine-ui` | HUD, menus, layout, accessibility, touch |
| `jgengine-assets` | models, sprites, audio files, licensing, catalogs |
| `jgengine-multiplayer` | authority, replication, sessions, persistence |
| `game-improvement` | deepening an existing game |
| `jgengine-verify` | before any claim that a change works |
| `workflow` | landing a change (monorepo) |
| `improve` | backlog passes |

World content is editor-first: anything that adds, moves or restyles something visible starts in `jgengine-editor`, and `jgengine-world` consumes the document.

## Discover before writing

1. `npx jgengine has "<feature>" ...` answers many features at once (covered, partial or gap, with imports). `npx jgengine find <intent>` names the home folder, primitives, recipes and assets. Search the moment you would hand-roll a HUD window, inventory grid, hotkey, minimap, stat bar or character motion.
2. `npx jgengine recipe <name>` prints a typechecked snippet; `npx jgengine recipe` lists them. [recipes/minimal-game.md](recipes/minimal-game.md) is the whole-game walkthrough; each domain has `recipes/`.
3. Open `api.md` or a `.d.ts` only for exact signatures, with grep.

If nothing fits, name the shared owner first (AGENTS.md, "Reusable capability goes upstream first"); report SDK gaps upstream outside this repo.

## Finish

Keep scene coordinates in the editor document, state serializable, randomness injected. A game is not done while its entities and props are box markers: run the asset pass in `jgengine-assets`. Prove it with `jgengine-verify`.
