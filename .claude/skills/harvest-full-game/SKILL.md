---
name: harvest-full-game
description: Run the full game loop end to end at full scope - research a game, build the WHOLE game from the jgengine intake and selectively routed API domains, track engine gaps, and file them as [FEATURE] issues.
disable-model-invocation: true
---

# The harvest-full-game loop

Same harvest as `harvest-game` â€” build a game, harvest the engine gaps it exposes â€” but the deliverable is the **complete game**, not a minimal slice. Building the whole thing surfaces the deep gaps a slice never reaches: economy, progression, quests, multiplayer sync, content-scale generators. If you only want a quick probe, use `harvest-game` instead.

Take the invocation argument and resolve a target game:

- **A specific game named** â†’ that's the target. Research it.
- **A link (repo or game page)** â†’ that's the target, and the link is its spec. Read it for mechanics, every signature system, camera, controls, and content breadth â€” it is a research source, never a port source. Build fresh from the engine surface; translating its code line-by-line faithfully recreates its workarounds and hides exactly the gaps this loop exists to expose.
- **A genre** â†’ pick a well-known game in that genre whose full-scope mechanics stress engine areas no existing `Games/*` game already covers.
- **Nothing / "find one"** â†’ web-research currently popular or recently viral games and pick one the engine can't obviously do yet. Prefer games whose defining mechanic looks missing from the engine surface.

Then run the whole loop in this session:

1. **Research.** Learn the target well enough to fill `jgengine`'s short numbered intake: POV, world, core loop, interaction, combat, progression, players, UI, art direction, and an observable done scenario. Keep the game profile in working notes only.
2. **Work on your session's branch**, per the root workflow â€” the PR comes later, when the game is real.
3. **Build the whole game** in `Games/<id>`. Fill the compact `jgengine` intake, read foundation plus only the selected API domains, then build straight through. Keep every system end-to-end, hit content breadth combinatorially, and dress the world. Build from documented engine surfaces, not copied game code.
4. **Track gaps the moment you hit them** in your working notes â€” one raw engine problem per line, engine terms only, no game context, no solutions. The bar is not "the engine couldn't do it" â€” friction is a gap too: anything the game had to hand-roll that should be a natural engine primitive or one-liner. Tag each line `blocker` (no engine-surface route existed), `workaround` (a route existed but the game had to hand-roll something the engine should own), or `ergonomics` (it worked but took boilerplate a primitive would erase). A gap you hit while building outranks a gap you suspect from reading; note both, but only after genuinely attempting the engine-surface route. Note: `jgengine`'s "Engine gaps" section says to fix a truly-missing primitive directly in this repo â€” for a harvest run, prefer logging the gap over closing it inline unless the fix is small and unblocks the phase, so the [FEATURE] list stays the record of what a full build actually exposed.
5. **Verify** per the intake's observable done scenario and the `jgengine-verify` skill: `bun run check-types`, `bun test packages Games` (including the co-located `<game>.world.test.ts` `summarizeEnvironment` assertions for every `environment()` world), then `bun run shoot <id> --mode ui` and `--mode play` as the final human glance â€” open the PNGs and actually look at them. A hung shot is never re-run in the foreground; the world test is what proves the scene resolved.
6. **Session end.** File the gaps as `[FEATURE]` issue(s) on this repo â€” title `[FEATURE] <brief summary>`, body a numbered list of the raw engine problems, each carrying its `blocker` / `workaround` / `ergonomics` tag (nothing else, no game context, no solutions). Then ship per CLAUDE.md's ship rule: push, open the PR (GitHub MCP `create_pull_request`), `subscribe_pr_activity`, squash-merge immediately (`merge_pull_request`, or queue `enable_pr_auto_merge` (squash) if checks block it), then verify green with the 60-second worker check per CLAUDE.md's ship rule (no `send_later` check-ins).

Because a full build may span sessions, hand off the numbered intake, completed work, and running gap list when needed. File issues only after the game is complete.

Finish by reporting: what was built and where, which phases landed, the issue link(s), and how many gaps were filed.


