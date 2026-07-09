---
name: harvest-full-game
description: Run the full game loop end to end at full scope - research a game, build the WHOLE game in Games/ via the jgengine-newgame blueprint-and-phases workflow (not a minimal slice), track engine gaps as you hit them, and file them as [FEATURE] issue(s) at session end. Invoke with a game name ("like <game>"), a genre, a link (repo or game page), or nothing to have one picked.
disable-model-invocation: true
---

# The harvest-full-game loop

Same harvest as `harvest-game` — build a game, harvest the engine gaps it exposes — but the deliverable is the **complete game**, not a minimal slice. Building the whole thing surfaces the deep gaps a slice never reaches: economy, progression, quests, multiplayer sync, content-scale generators. If you only want a quick probe, use `harvest-game` instead.

Take the invocation argument and resolve a target game:

- **A specific game named** → that's the target. Research it.
- **A link (repo or game page)** → that's the target, and the link is its spec. Read it for mechanics, every signature system, camera, controls, and content breadth — it is a research source, never a port source. Build fresh from the engine surface; translating its code line-by-line faithfully recreates its workarounds and hides exactly the gaps this loop exists to expose.
- **A genre** → pick a well-known game in that genre whose full-scope mechanics stress engine areas no existing `Games/*` game already covers.
- **Nothing / "find one"** → web-research currently popular or recently viral games and pick one the engine can't obviously do yet. Prefer games whose defining mechanic looks missing from the engine surface.

Then run the whole loop in this session:

1. **Research.** Web-search the target's core loop, every signature system, camera, controls, win conditions, HUD, and content breadth until you can write the full-scope master blueprint. Keep the game profile in your working notes only — the game's name and genre must never appear in the filed issue or any committed text other than the game's own directory.
2. **Work on your session's branch**, per the root workflow — the PR comes later, when the game is real.
3. **Build the whole game** in `Games/<id>`, following the `jgengine-newgame` skill in full: open with the master blueprint (ranked pillars, perspective, system list + coupling map, content budget, asset plan, art direction with a committed palette and UI voice, file tree, keybinds, non-goals, phase plan with per-phase observable acceptance), then execute the phases straight through — every phase whole, no half systems, content budgets hit combinatorially, the world dressed. This is the entire difference from `harvest-game`: you deliver the full blueprint, not a core-loop demo. Wire it as the other `Games/*` do: a private workspace package `@games/<id>` with `./src` exports and no build, plus the standalone dev harness `check-game-shape` enforces (root `index.html` + `vite.config.ts`, `src/index.css`, a `"dev": "vite"` script). Games auto-register from `Games/*` in `apps/dev`'s registry and the jgengine.com Games dropdown — no registry entry, vite alias, or `@games` dependency to add by hand. Build from the engine surface in the `jgengine-api` skill, not by copying other games.
4. **Track gaps the moment you hit them** in your working notes — one raw engine problem per line, engine terms only, no game context, no solutions. The bar is not "the engine couldn't do it" — friction is a gap too: anything the game had to hand-roll that should be a natural engine primitive or one-liner. Tag each line `blocker` (no engine-surface route existed), `workaround` (a route existed but the game had to hand-roll something the engine should own), or `ergonomics` (it worked but took boilerplate a primitive would erase). A gap you hit while building outranks a gap you suspect from reading; note both, but only after genuinely attempting the engine-surface route. Note: `jgengine-newgame`'s "Engine gaps" section says to fix a truly-missing primitive directly in this repo — for a harvest run, prefer logging the gap over closing it inline unless the fix is small and unblocks the phase, so the [FEATURE] list stays the record of what a full build actually exposed.
5. **Verify** per the full-game checklist in `jgengine-newgame` and the `jgengine-verify` skill: `bun run check-types`, `bun test packages Games` (including the co-located `<game>.world.test.ts` `summarizeEnvironment` assertions for every `environment()` world), then `bun run shoot <id> --mode ui` and `--mode play` as the final human glance — open the PNGs and actually look at them. A hung shot is never re-run in the foreground; the world test is what proves the scene resolved.
6. **Session end.** File the gaps as `[FEATURE]` issue(s) on this repo — title `[FEATURE] <brief summary>`, body a numbered list of the raw engine problems, each carrying its `blocker` / `workaround` / `ergonomics` tag (nothing else, no game context, no solutions). Then push, open the PR (GitHub MCP `create_pull_request`), and squash-merge it immediately (`merge_pull_request`) — the local gate already proved what CI would. If required checks block the instant merge, queue `enable_pr_auto_merge` (squash) and end the turn; never subscribe to, watch, or poll CI.

Because a full build is large, phases may span sessions — the `jgengine-newgame` phase plan is the roadmap the next session resumes from. File the [FEATURE] issue(s) once the game is genuinely complete (last phase landed, full-game checklist passes); if you stop mid-build, hand off the phase plan and the running gap list rather than filing a partial issue.

Finish by reporting: what was built and where, which phases landed, the issue link(s), and how many gaps were filed.
