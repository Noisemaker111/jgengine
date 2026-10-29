---
name: create-game-jg
description: Start a new game or big feature - agree direction, write its design brief, build.
---

# Create a game

A game starts as an agreed plan, not as code. The plan is a file, `games/<id>/PLAN.md` (in a created
project, `PLAN.md` at its root), written with the user before `jgengine create` runs. No step below is
skipped because the brief looks obvious: "ARK 1:1" still leaves which systems, how deep, and what
"done" means open.

The goal is a game with hours of play, not a short demo. The plan's design brief (step 3) says what
those hours are, and every milestone adds the next 10 minutes of them.

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
- **Length**: how many hours until the player has seen everything, how long a sitting is, and how
  the game teaches (a guide character, objectives, hints, or learning by doing).
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
- `## Direction`: the agreed answers from step 1, including what is out and the done scenario, plus the player
  promise, pillars, anti-pillars and falsifier (`game-design` playbook §1).
- `## Design brief`: the game's loops and its first 10 minutes, before any feature. Lines for the
  core loop (30 seconds), session loop (one sitting) and long loop (hours); `Second 0:` what the
  player has at the start and why that is the right first verb; `Onboarding:`; `Pace:` something
  new every N minutes; `Longest cycle:`; `Minutes to see everything:`. Then `### First 10 minutes`
  (at least five `- m:ss` beats to past 8:00, each saying what it teaches or unlocks, one by 2:00),
  `### Start state` (probe readings a new game may start with, at most), `### Content budget`
  (kinds and counts) and `### Systems` (each system and the probe reading that shows it was used).
  In this repo `games/scripts/designBrief.ts` holds the exact shape, `games/scripts/briefExample.ts`
  a complete one, and `bun run check games-design` fails a game without it. Design the loops here,
  with `game-design`, not later in code.
- `## Features`: one bullet per feature, `name — engine owner` (the import or folder `has` gave),
  verdict in brackets for partial ones.
- `## Gaps`: every gap and partial as new engine work: what to build, in which
  `packages/<pkg>/src/<feature>/` folder, with this game as its first adopter. `bun run check
  games-design` reads this heading as the game's gap to target; write `- none` when there is none.
- `## Milestones`: `- [ ] 1. ...` checkboxes, one commit (or a few) each on the game's one branch, in build order (the gaps a later milestone
  needs come first). Each milestone is the next 10 minutes of play, not one more system: what a
  player starting from a new game now does, learns and unlocks, and how far into the brief's first
  10 minutes (then the session and long loop) it reaches. Milestone 1 is the core loop playable from
  second 0. Each is proven by the game's from-zero flow reaching further.

For a 3D game also write `src/art-direction.md` before any code.

## 4. Create, then build milestone by milestone

Pick the template from the direction: `create` defaults to a 3D world (terrain, sky, player model,
editor scene); a grid, card, tile or other board game with no 3D scene takes `--template 2d`;
`--template builder` for a build-first game. `bun run jgengine create "<Title>"` (it lands in
`games/`; `npx jgengine create` outside the repo) is the one way to start a game: never copy another
game's folder. The game's `jgengine.json` says what it is and uses; change it and run `jgengine sync`.

Then take the milestones in order, all on the one branch the game was asked for in. Each milestone
builds its engine gap upstream first (root `AGENTS.md`, "Game changes improve the framework"), is
committed when it plays, and ticks itself in `PLAN.md` in that commit. When the build teaches
something that changes the direction, brief, features or order, edit `PLAN.md` in the same commit.
The branch lands once, with `bun run lane:close`, when the milestones asked for are done; a
milestone is never a PR of its own.

The proof is `proofs/flows/from-zero.flow.ts`: a new game with no save or prepared state, played
through real input (no teleports, clock scaling or dev commands), with a probe reporting `taught`,
`unlocks`, each budget kind's `<kind>Seen` and `<kind>Total`, and each system's reading. `bun run
check games-depth` plays it against the brief and the depth bars in `games/scripts/fromZero.ts`;
`games/README.md` ("Design checklist and loop proofs") says what fails. Never seed a save or a
mid-game state to make a milestone look reached, and never loosen a bar.

Treat the pitch as a unique composition of needs, never a genre kit or preset. Use `game-design` for
the player promise, loops and progression, `level-design` for authored spaces, and the domain skills
the `jgengine` skill routes to for each system.
