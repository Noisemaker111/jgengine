---
name: harvest
description: Do any task in this repo AND leave the engine better than you found it. Same harvest instinct as harvest-game/harvest-full-game — but the carrier isn't a game, it's whatever task you were given (a fix, a feature, a refactor, a question, a doc pass). Complete the task, and treat every gap, friction, workaround, and doc error you hit along the way as an engine-improvement opportunity to close now or file. Invoke with the task, or nothing to have the standing gap list picked from.
disable-model-invocation: true
---

# The harvest loop

`harvest-game` and `harvest-full-game` build a game to *expose* engine gaps. This skill drops the game: the carrier is **whatever task you were handed**. The task still ships — but a harvest run is never just the task. You do the task *and* you make the engine better as much as you can while you're in there, because doing real work is the best gap-finder there is.

Two deliverables, both required: **the task done**, and **the engine improved**. A run that only does the task and leaves no engine trace missed the point; a run that improves the engine but drops the task failed the user. Hit both.

Take the invocation argument and resolve the work:

- **A concrete task named** (fix, feature, refactor, question, doc pass, investigation) → that's the carrier. Do it.
- **A link (issue, PR, file, error)** → read it for what's actually being asked, then do that. A `[FEATURE]` gap issue is a natural carrier — close the gap *is* the task.
- **Nothing / "find something"** → pull from the standing gap list: open `[FEATURE]` issues on this repo (`search_issues`), plus any `TODO`/doc-drift you already know about. Pick one whose fix teaches the most about the engine surface.

Then run the loop in this session:

1. **Understand the task, then the seam under it.** Do enough research to do the task right — but a harvest run always asks *why* before patching (per the root guide): the surprising amount of code, the tweak that shouldn't be needed, the thing you had to hand-roll is almost always a missing engine primitive, a wrong default, or a doc error. Name that root cause before you write the patch. This is the whole difference between doing the task and harvesting from it.
2. **Work on your session's branch**, per the root workflow. If the carrier is a tracked issue, claim it first (`add_issue_comment`, `Working on this in claude/<branch>`) before the token-heavy work.
3. **Do the task, at the root.** Fix the underlying reason, not the surface symptom — this *is* the engine repo, so a genuinely-missing primitive, a wrong default, or a doc error gets fixed directly here, not worked around (root guide: "Ask why before patching"). Respect layering (`core` imports nothing; the one-directional chain in the root guide) and the no-comments / dense-files style. Extracting an SDK primitive must not change observable behavior of any existing game or package — extract *behind* the feature.
4. **Track gaps the moment you hit them** in your working notes — one raw engine problem per line, engine terms only, no solutions inline. The bar is not "the engine couldn't do it": friction is a gap too — anything you had to hand-roll that should be a natural primitive or one-liner, any default that fought you, any doc that lied. Tag each line `blocker` (no engine-surface route existed), `workaround` (a route existed but you had to hand-roll something the engine should own), or `ergonomics` (it worked but took boilerplate a primitive would erase). A gap you hit while working outranks one you suspect from reading.
5. **Harvest the gaps — close now or file.** For each tracked gap, decide: **close it now** if the fix is small, in-layer, and doesn't balloon the task's scope or risk (the engine repo's default — fix directly); **file it** as a `[FEATURE]` issue if it's a real primitive-sized change that would derail this task or needs its own design pass. Don't let a run end with a gap neither closed nor filed. When you close a gap, it earns the same verification as the task. When you file one, title `[FEATURE] <brief summary>`, body a numbered list of the raw engine problems each carrying its `blocker`/`workaround`/`ergonomics` tag — engine terms only, no task narrative, no solutions.
6. **Verify — via `fan-out` workers, never inline on the frontier model.** Run the `jgengine-verify` ladder cheapest-gate-first: `bun run check-types`, then `bun run test` (`bun test packages Games`), then `bun run build`. For any scene- or HUD-shaped change, prove world content with `summarizeEnvironment` assertions in `bun test` before any screenshot; `bun run shoot <id> --mode ui|play` is a final human glance, never the inner loop, and a hung shot is never re-run in the foreground. Both the task's change and every gap you closed pass the ladder together.
7. **Ship, park, stop.** Push, open the PR (GitHub MCP `create_pull_request`, ready for review), `subscribe_pr_activity`, confirm the PR's checks go green — never merge; the user merges on request. If a fixed `[FEATURE]` gap issue was your carrier or you closed one inline, put `Closes #N` in the PR body. Red checks → fix on the same branch, push, re-check. Echo 🚀 once the PR is up and green (chat only, never on GitHub).

Because the task's scope varies, so does the run: a one-line doc fix that closes a gap is a whole harvest; a refactor that exposes six primitives is a whole harvest. Don't inflate a small task into a full build, and don't ship a slice when the task asked for the whole thing — match the carrier.

Finish by reporting: what the task was and that it landed, which gaps you closed inline vs. filed (with issue link(s)), and the PR link.
