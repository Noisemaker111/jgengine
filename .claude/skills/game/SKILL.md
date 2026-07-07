---
name: game
description: Run the full game loop end to end - research a game, build a minimal version in Games/, log engine gaps in Games/TODO.md, and file the [FEATURE] issue at session end. Invoke with a game name ("like <game>"), a genre, or nothing to have one picked.
disable-model-invocation: true
---

# The game loop

Take the invocation argument and resolve a target game:

- **A specific game named** → that's the target. Research it.
- **A genre** → pick a well-known game in that genre whose core mechanics stress engine areas no existing `Games/*` game already covers.
- **Nothing / "find one"** → web-research currently popular or recently viral games and pick one the engine can't obviously do yet. Prefer games whose defining mechanic looks missing from the engine surface.

Then run the whole loop in this session:

1. **Research.** Web-search the target's core loop, mechanics, camera, controls, win conditions, and HUD until you can describe a minimal playable slice. Keep the game profile in your working notes only — the game's name and genre must never appear in `Games/TODO.md`, the issue, or any committed text other than the game's own directory.
2. **Branch + draft PR first**, per the root workflow, before building.
3. **Build** a minimal playable version in `Games/<id>` — core loop playable, not a full clone. Follow `Games/CLAUDE.md` for wiring and the `jgengine-newgame` skill for the build phases. Build from the engine surface in the `jgengine-api` skill, not by copying other games.
4. **Log gaps the moment you hit them.** The rules in `Games/CLAUDE.md` are mandatory: one `- [ ]` line per raw problem in `Games/TODO.md`, engine terms only, no solutions. A gap you hit while building outranks a gap you suspect from reading; log both, but only after genuinely attempting the engine-surface route.
5. **Verify.** `bun run check-types`, `bun test packages Games`, then `bun run shoot <id> --mode ui` and `--mode play` — open the PNGs and actually look at them.
6. **Session end**, exactly as `Games/CLAUDE.md` specifies: commit the new `TODO.md` entries, file the one `[FEATURE]` issue (numbered list, nothing else), add the `Issue #<n>` line above the batch and commit it, then mark the PR ready and watch CI to green.

Finish by reporting: what was built and where, the issue link, and how many gap boxes were added.
