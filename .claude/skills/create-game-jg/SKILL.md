---
name: create-game-jg
description: Start a new game or big feature - agree direction, write PLAN.md, build by milestones.
---

# Create a game

A game starts as an agreed plan, not as code. The plan is a file, `games/<id>/PLAN.md` (in a created
project, `PLAN.md` at its root), written with the user before `jgengine create` runs. No step below is
skipped because the brief looks obvious: "ARK 1:1" still leaves which systems, how deep, and what
"done" means open.

## 1. Agree the direction with the user, before any code

Ask one short message of concrete questions, each with options and your suggested pick, so the user
can answer in a few words. Cover:

- **Genre and references**: which games it is like; for each, what to take from it.
- **Faithfulness**: a 1:1 remake (same systems, numbers, map shape; real data via `bun run data-table`),
  inspired by (same fantasy, own rules), or a mash-up.
- **Breadth**: which systems are in, and how deep each goes (a working version or the full one). Name
  what is out.
- **Direction**: look (art direction, realistic or stylized), camera and controls, world scale
  (one arena, a region, an open map), solo or multiplayer (local, hosted, persistent), platforms
  (desktop, phone, both).
- **Done**: one observable scenario that proves the game, e.g. "tame a raptor, ride it to the
  obelisk, survive the night".

Then write the answers back as a short summary and get a yes before step 2. A change to any of these
later is a change to the plan first.

## 2. Map every feature to the engine in one call

List every feature the agreed direction implies, a few words each, and ask the engine about all of
them at once:

```
bun run jgengine has taming torpor riding "snap building" "hunger thirst" weather ...
```

(`npx jgengine has ...` in a created project.) Each answer is `covered` (a shipped capability, with
its import), `partial` (some of it, or only a folder named for it) or `gap` (nothing). Check a
`partial` by reading the named folder before trusting or dismissing it. Never search one feature at a
time.

## 3. Write PLAN.md

One file, these sections, in this order:

- `# <Title> plan`, then `Brief:` the user's words.
- `## Direction`: the agreed answers from step 1, including what is out and the done scenario.
- `## Features`: one bullet per feature, `name — engine owner` (the import or folder `has` gave),
  verdict in brackets for partial ones.
- `## Gaps`: every gap and partial as new engine work: what to build, in which
  `packages/<pkg>/src/<feature>/` folder, with this game as its first adopter. `bun run check
  games-design` reads this heading as the game's gap to target; write `- none` when there is none.
- `## Milestones`: `- [ ] 1. ...` checkboxes, one PR each, in build order (the gaps a later milestone
  needs come first). Each names what the player can do when it lands and how that is proven (a loop
  proof flow, a drive, a test).

For a 3D game also write `src/art-direction.md` before any code.

## 4. Create, then build milestone by milestone

Pick the template from the direction: `create` defaults to a 3D world (terrain, sky, player model,
editor scene); a grid, card, tile or other board game with no 3D scene takes `--template 2d`;
`--template builder` for a build-first game. `bun run jgengine create "<Title>"` (it lands in
`games/`; `npx jgengine create` outside the repo) is the one way to start a game: never copy another
game's folder. The game's `jgengine.json` says what it is and uses; change it and run `jgengine sync`.

Then take the milestones in order. Each PR builds one milestone, ticks it in `PLAN.md`, and builds
its engine gap upstream first (root `AGENTS.md`, "Game changes improve the framework"). When the
build teaches something that changes the direction, features or order, edit `PLAN.md` in that PR.

Treat the pitch as a unique composition of needs, never a genre kit or preset. Use `game-design` for
the player promise, loops and progression, `level-design` for authored spaces, and the domain skills
the `jgengine` skill routes to for each system.
