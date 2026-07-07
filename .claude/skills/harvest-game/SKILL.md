---
name: harvest-game
description: Run the full game loop end to end - research a game, build a minimal version in Games/, track engine gaps as you hit them, and file them as [FEATURE] issue(s) at session end. Invoke with a game name ("like <game>"), a genre, or nothing to have one picked.
disable-model-invocation: true
---

# The harvest-game loop

Build a game, harvest the engine gaps it exposes. Take the invocation argument and resolve a target game:

- **A specific game named** → that's the target. Research it.
- **A genre** → pick a well-known game in that genre whose core mechanics stress engine areas no existing `Games/*` game already covers.
- **Nothing / "find one"** → web-research currently popular or recently viral games and pick one the engine can't obviously do yet. Prefer games whose defining mechanic looks missing from the engine surface.

Then run the whole loop in this session:

1. **Research.** Web-search the target's core loop, mechanics, camera, controls, win conditions, and HUD until you can describe a minimal playable slice. Keep the game profile in your working notes only — the game's name and genre must never appear in the filed issue or any committed text other than the game's own directory.
2. **Branch + draft PR first**, per the root workflow, before building.
3. **Build** a minimal playable version in `Games/<id>` — core loop playable, not a full clone. Wire it as the other `Games/*` do: a private workspace package `@games/<id>` with `./src` exports and no build, registered in `apps/dev/src/main.tsx` with a matching alias in `apps/dev/vite.config.ts` (HUD Tailwind classes are already covered by the `Games` `@source` entry in `apps/dev/src/index.css`). Follow the `jgengine-newgame` skill for the build phases and build from the engine surface in the `jgengine-api` skill, not by copying other games.
4. **Track gaps the moment you hit them** in your working notes — one raw engine problem per line, engine terms only, no game context, no solutions. A gap you hit while building outranks a gap you suspect from reading; note both, but only after genuinely attempting the engine-surface route.
5. **Verify.** `bun run check-types`, `bun test packages Games`, then `bun run shoot <id> --mode ui` and `--mode play` — open the PNGs and actually look at them.
6. **Session end.** File the gaps as `[FEATURE]` issue(s) on this repo — title `[FEATURE] <brief summary>`, body a numbered list of the raw engine problems (nothing else, no game context, no solutions). Then mark the PR ready and watch CI to green.

Finish by reporting: what was built and where, the issue link(s), and how many gaps were filed.
