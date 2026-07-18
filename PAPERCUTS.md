# Papercuts

Small frictions hit while working — a retried tool call, a dead-end command, a
broken link, a confusing setup step, a flaky script, a stale cache, a misleading
error, a non-obvious gotcha, a task that took far longer than it should have, or
any solvable bump in the road. One or two sentences: what you were doing → what got
in the way (a guess at the cause or fix is a bonus). Log them in the moment, even
though none are blocking; together they show where the repo needs sanding down.

Distinct from CHANGELOG.md (what shipped) and from tracked issues (real bugs).

Log one:

    bun run papercut -m <model> "message"

Every so often these get swept: read the list, make the easy fixes, clear them.

---

2026-07-18T14:14:38.795Z — claude-fable-5 — Claude

capturing editor screenshots via drive: camera_goto only pans the orbit target with no distance/pitch control and KeyF framing can bury the camera in terrain/buildings — getting a usable aerial of a district took ~8 drive round-trips of guessing y offsets

2026-07-18T16:20:39.762Z — claude-fable-5 — Claude

Rebasing a feature branch via stash/rebase/stash-pop → pop left conflict markers in a file I'd already verified; ship:preflight passed anyway (it checks tree/base/diff, not compilation), so the broken file reached CI. A cheap conflict-marker grep or tsc-on-changed-files in agent-preflight --ship would have caught it locally.

2026-07-18T16:59:02.348Z — cloud-agent — Claude

Running bun run gate on a fresh cloud container → agent:preflight fails on missing node_modules before build's ensure-ready --install-only can run; had to bun install manually first. Preflight could auto-install or point at ensure-ready.
