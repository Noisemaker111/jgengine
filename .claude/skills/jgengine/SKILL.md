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

If nothing fits, name the shared owner first ([AGENTS.md](../../../AGENTS.md#game-changes-improve-the-framework)). A part the engine lacks becomes an engine proposal, so the game keeps going and the gap has a trail back to the engine:

1. Write it in `<feature>.engine.ts` next to the game code, exporting `proposal = defineEngineProposal({ id, target, need, kind, exports })` (`@jgengine/core/meta/proposal`) and the implementation under the names and signatures it should have at `target`. `kind` is `new`, `extend`, or `fork` (with `fork: "packages/<pkg>/src/<file>.ts"`, the engine file it copies). For an `extend`, list in `exports` the names the extension adds, so status can tell when it lands. A part too big for one file owns its folder: `cave/cave.engine.ts` may import the rest of `cave/`.
2. It imports only public `@jgengine/*` paths, other `*.engine.ts` files and packages, never the game's own files, so it lifts into the engine as-is. The game imports it like any module.
3. `npx jgengine propose` prints a ready-to-file issue per proposal (title, need, target, the full file, a diff for a fork); file it with `gh issue create` or the GitHub tools. `--list` shows each status (`local`, `partial`, `upstream`), `--check` fails on a broken proposal, an id two games carry (the second adopter builds it upstream), or one whose exports now resolve at `target` (switch the imports to `target` and delete the file). `--migrate <folder>` turns an old `engine-local/<name>/` folder into proposal form.

## Finish

Declare the game's genres in `jgengine.json` (`suite`) and prove each required player verb with a headless proof; `jgengine suite <game>` is the score ([game proofs](../../../games/README.md#design-checklist-and-loop-proofs)). Keep scene coordinates in the editor document, state serializable, randomness injected. A game is not done while its entities and props are box markers: run the asset pass in `jgengine-assets`. Prove it with `jgengine-verify`.
