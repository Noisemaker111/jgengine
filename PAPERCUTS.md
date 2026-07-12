# Papercuts

Small frictions hit while working — a retried tool call, a dead-end command, a
broken link, a confusing setup step, a flaky script, a stale cache, a misleading
error, a non-obvious gotcha. One or two sentences: what you were doing → what got
in the way (a guess at the cause or fix is a bonus). Log them in the moment, even
though none are blocking; together they show where the repo needs sanding down.

Distinct from CHANGELOG.md (what shipped) and from tracked issues (real bugs).

Log one:

    bun run papercut -m <model> "message"

Every so often these get swept: read the list, make the easy fixes, clear them.

---

2026-07-12T00:02:14.895Z — claude-fable-5 — Claude

papercut sweep itself → papercut-reminder Stop hook false-positived again: 'do not background' is standard brief boilerplate, not relaunch evidence; hints now require explicit relaunch/failed-attempt language

2026-07-12T00:28:50.375Z — sonnet — Claude

batch preview-authoring workers stalled silently after partial completion → had to diff disk vs briefs and re-ping two coordinators

2026-07-12T00:28:50.429Z — sonnet — Claude

workers repeatedly backgrounded foreground briefs (ship motion, screenshot sweep) and ended turn with 'running in background' → each needed a resume nudge

2026-07-12T00:28:50.474Z — fable — Claude

check-game-shape gate rejected new cross-game contract file preview.tsx at src root → whitelist edit needed mid-ship

2026-07-12T00:33:41.028Z — fable-5 — Claude

briefed a Sonnet worker to run gates+ship → it recursively spawned background sub-workers and returned 'will report later' twice, nearly triple-running the ship motion

2026-07-12T00:39:22.703Z — opus — Claude

gate worker backgrounded build/check-types/test and returned 'still running' with no results → had to re-run; backgrounded verify dies with the worker turn, wasted a round

2026-07-12T00:42:13.755Z — sonnet — Claude

second ship worker in one session ended its turn with 'waiting on gate worker, will react' after spawning a nested background agent → ship motion stalled, orchestrator had to resume it

2026-07-12T00:59:12.493Z — claude-fable-5 — Claude

ship worker for the self-hosted mirror returned 'I'll wait for the background agent notification' as its final result despite an explicit do-not-delegate, execute-in-this-turn brief — the enforcement gap is in worker behavior, not brief wording; needed a SendMessage resume

2026-07-12T01:02:27.112Z — opus — Claude

screenshot worker: fade-up entrance anim + post-hydration layout shift drifts coordinate taps onto wrong element for ~2s after content appears; need DOM .click() + settle wait, not synthetic CDP tap

2026-07-12T01:35:08.028Z — opus-4-8 — Claude

v0.9.0 release bumped 8 package.json versions but left bun.lock unsynced → every CI job died at 'bun install --frozen-lockfile: lockfile had changes'. The local release gate (check-types + build) doesn't run a frozen install, so it passed locally and the break only showed in CI. A version bump must run 'bun install' and commit bun.lock, and/or the release gate should run 'bun install --frozen-lockfile'.

2026-07-12T01:35:11.239Z — opus-4-8 — Claude

speed-circuit smoke job intermittently fails with 'Chrome debugger not ready on :<port> within 30000ms' (other games boot fine, no app error) — a pure infra/launch-timing flake. It red-flagged a healthy main and blocked a release precondition, and the GitHub App can't rerun-failed-jobs (403), so recovery needs a fresh push. Consider bumping the smoke debugger-connect timeout or adding one retry.

2026-07-12T01:38:10.944Z — opus — Claude

screenshot workers: playwright-core expects chromium rev 1228 but /opt/pw-browsers only caches 1194 → default chromium.launch() fails; must pin executablePath to /opt/pw-browsers/chromium-1194/chrome-linux/chrome

2026-07-12T01:47:51.487Z — sonnet — Claude

ship worker re-delegated instead of executing → returned 'launched a worker and returning' non-answer, nearly caused a duplicate PR on already-merged history; briefs should say 'you are the worker, do not spawn sub-agents'

2026-07-12T01:47:51.521Z — sonnet — Claude

gate worker ran per-package 'bun run check-types' without 'bun scripts/ensure-ready.ts' first → false RED with TS2307 on @jgengine/github (exports point at unbuilt dist/); wasted a round diagnosing a non-bug

2026-07-12T02:54:23.153Z — sonnet — Claude

ship worker returned after 21s claiming a background handoff without committing/pushing → had to re-spawn a synchronous worker

2026-07-12T02:55:51.618Z — fable-5 — Claude

multi-round verify loop → stop-hook demanded a commit+push after every single fix round, forcing commit churn workers mid-verification

2026-07-12T02:55:51.647Z — fable-5 — Claude

briefed a Sonnet worker to run gates → it spawned its own background child and returned 'launched in background' instead of results; had to re-run with explicit foreground instruction

2026-07-12T04:20:45.614Z — fable-5 — Claude

ship worker replied 'running in background, will report' and its TaskOutput id 404'd → dispatched a duplicate worker; the original had actually finished under a different task id with the commit already pushed

2026-07-12T04:59:14.718Z — fable-5 — Claude

delegated verify/screenshot workers twice re-delegated to sub-workers and returned 'waiting on the worker' as their result → had to re-dispatch with explicit 'do not spawn sub-agents' briefs
2026-07-12T05:19:28.342Z — fable-5 — Claude

probe-testing new:game → bun's lenient package.json parser masked a dangling comma my cleanup left; strict python json caught it — validate root package.json with a strict parser after scripted edits

2026-07-12T05:26:39.405Z — fable-5 — Claude

PR #563 squash-merge was a no-op: fix branch's net diff for generated/index.ts canceled against merge-base since branch already contained the clobbering commit landed separately via #550 → main stayed red after 'merge'; had to re-cut a fresh branch off main as #566

2026-07-12T05:33:03.754Z — fable-5 — Claude

waited on merge-commit CI → CLAUDE.md claims no Actions job exceeds ~1 min, but apps/web build now runs ~6 min; the stale claim caused a false hung-job investigation

2026-07-12T15:41:20.498Z — claude-opus-4-8 — Claude

backgrounded ship worker stalled after its gate sub-workers passed but before committing → detected only via staged-but-uncommitted tree, had to stop it and take over the ship, cost several cycles

2026-07-12T15:41:20.537Z — claude-opus-4-8 — Claude

local check-types failed spuriously on stale node_modules symlinks in examples/next-host + tanstack-host (missing @games/nonogram link) → needed rm -rf node_modules + bun install; main was already green

2026-07-12T15:47:53.182Z — sonnet-5 — Claude

drag-and-drop ActionBar edit → ActionBar() drop handler referenced commands without calling useGame() there, check-types caught it
