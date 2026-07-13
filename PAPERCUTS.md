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

2026-07-12T17:33:16.570Z — opus — Claude

gen:skill-api run before node_modules finished installing silently mis-parsed several packages and overwrote scripts/api-doc-baseline.json with corrupted (dropped) entries, then surfaced only downstream as a bogus check-types 'new debt' failure — no error at gen time

2026-07-12T19:17:09.749Z — opus-4.8 — Claude

phase-7a ship worker pushed the branch onto pre-#595-merge history, so PR #596 showed mergeable_state=dirty; local HEAD was actually clean one-commit-on-main, fix was a force-with-lease push, not a rebase — a merge worker should verify origin/main's real tip before diagnosing a PR conflict

2026-07-12T20:30:18.174Z — opus-4.8 — Claude

briefed a gate worker with literal 'bun test' → it scanned the whole tree unbounded (incl Games/) and hung 10min with zero output before the guard killed it; the repo gate is 'bun run test' (guarded, scoped to packages apps/dev scripts). Bare 'bun test' is a footgun in briefs.

2026-07-12T21:03:16.266Z — opus-4.8 — Claude

drive tool: guessed '--keys "s s s"' to walk the camera; that flag doesn't exist — it's '--key <Code>:<holdMs>' (singular, one per flag, e.g. --key KeyS:2500). CLAUDE.md's drive example only shows --click/--shot, so the movement flag is undiscoverable without --help.

2026-07-12T21:06:24.915Z — sonnet-5 — Claude

ship worker returned 'running in background, will report when done' after 1 tool-use/26s without running the gate or committing anything — a no-op that looked like success; had to verify git state manually and re-dispatch. Ship-motion workers should be told explicitly to perform every step synchronously in-run, not defer.

2026-07-12T22:23:41.543Z — sonnet — Claude

gate worker briefed to run gen:skill-api/check-types/test twice returned 'waiting on background work' instead of results — had to resume with explicit foreground-only instruction

2026-07-12T22:57:25.162Z — sonnet — Claude

merging main into a branch → gen:skill-api falsely flagged 45 documented exports as new undocumented debt because packages/*/dist was stale (gitignored, JSDoc-stripped build not rebuilt) — bun run build before gen:skill-api fixed it, but the error message pointed at doc-writing, not a stale build

2026-07-12T23:02:02.714Z — fable — NoisemakerJon

measuring editor fps via claude-in-chrome → backgrounded tab starves rAF so CDP evals time out at 45s looking like a hard page freeze; had to pivot to headless drive + in-editor PerfProbe

2026-07-12T23:02:02.831Z — fable — NoisemakerJon

check-types → 445 stray compiled .js/.d.ts sitting beside src (tsgo run outside dist) blocked the artifact gate; sibling-match rm before anything could run

2026-07-12T20:40:00.000Z — gpt-5.6-thinking — ChatGPT

expensive frontier session reacted to every worker/task/GitHub transition with phase recaps, wait promises, PR-open/merge narration, CI estimates, and mid-flight papercut housekeeping → dozens of unnecessary frontier turns and a git race; cap delegated work at one optional launch line plus one terminal result, treat progress events as non-conversational, and keep the entire serial ship motion inside one cheap worker return

2026-07-13T03:17:31.731Z — claude-opus-4-8 — Claude

gen:skill-api errored 'ts-morph missing; finish bun install first' but a fresh 'bun install' reported no changes/already complete — the message steered a wasted re-run when node_modules was actually fine (stale dist was the real cause via ensure-ready)

2026-07-13T03:45:17.053Z — sonnet — Claude

ship worker double-created the editor-overhaul PR (#650 and #651, same head sha) → duplicate merged no-op PR and confusing webhook stream

2026-07-13T03:53:06.709Z — claude-opus-4-8 — Claude

multi-worker fan-out wait → Stop hook 'commit your changes' fired on every quiet turn while background workers were mid-edit; committing then would have captured partial worker state. Hook can't see in-flight background agents.

2026-07-13T15:37:44.050Z — fable-5 — Claude

assets pull in cloud sandbox → bun fetch dies with 'socket connection was closed unexpectedly' on release-assets.githubusercontent.com through the agent proxy (CONNECT ok, TLS stream killed); curl succeeds — needed a curl fallback in the CLI

2026-07-13T16:37:20.805Z — Sonnet 5 — Claude

ship motion: gen:skill-api before bun install/build produced spurious api.md diffs (removed exports) that silently reverted after gate's build step — re-run gen:skill-api after build, not before
