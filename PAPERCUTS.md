# Papercuts

Small frictions hit while working â€” a retried tool call, a dead-end command, a
broken link, a confusing setup step, a flaky script, a stale cache, a misleading
error, a non-obvious gotcha. One or two sentences: what you were doing â†’ what got
in the way (a guess at the cause or fix is a bonus). Log them in the moment, even
though none are blocking; together they show where the repo needs sanding down.

Distinct from CHANGELOG.md (what shipped) and from tracked issues (real bugs).

Log one:

    bun run papercut -m <model> "message"

Every so often these get swept: read the list, make the easy fixes, clear them.

---

2026-07-12T00:02:14.895Z â€” claude-fable-5 â€” Claude

papercut sweep itself â†’ papercut-reminder Stop hook false-positived again: 'do not background' is standard brief boilerplate, not relaunch evidence; hints now require explicit relaunch/failed-attempt language

2026-07-12T00:28:50.375Z â€” sonnet â€” Claude

batch preview-authoring workers stalled silently after partial completion â†’ had to diff disk vs briefs and re-ping two coordinators

2026-07-12T00:28:50.429Z â€” sonnet â€” Claude

workers repeatedly backgrounded foreground briefs (ship motion, screenshot sweep) and ended turn with 'running in background' â†’ each needed a resume nudge

2026-07-12T00:28:50.474Z â€” fable â€” Claude

check-game-shape gate rejected new cross-game contract file preview.tsx at src root â†’ whitelist edit needed mid-ship

2026-07-12T00:33:41.028Z â€” fable-5 â€” Claude

briefed a Sonnet worker to run gates+ship â†’ it recursively spawned background sub-workers and returned 'will report later' twice, nearly triple-running the ship motion

2026-07-12T00:39:22.703Z â€” opus â€” Claude

gate worker backgrounded build/check-types/test and returned 'still running' with no results â†’ had to re-run; backgrounded verify dies with the worker turn, wasted a round

2026-07-12T00:42:13.755Z â€” sonnet â€” Claude

second ship worker in one session ended its turn with 'waiting on gate worker, will react' after spawning a nested background agent â†’ ship motion stalled, orchestrator had to resume it

2026-07-12T00:59:12.493Z â€” claude-fable-5 â€” Claude

ship worker for the self-hosted mirror returned 'I'll wait for the background agent notification' as its final result despite an explicit do-not-delegate, execute-in-this-turn brief â€” the enforcement gap is in worker behavior, not brief wording; needed a SendMessage resume

2026-07-12T01:02:27.112Z â€” opus â€” Claude

screenshot worker: fade-up entrance anim + post-hydration layout shift drifts coordinate taps onto wrong element for ~2s after content appears; need DOM .click() + settle wait, not synthetic CDP tap

2026-07-12T01:35:08.028Z â€” opus-4-8 â€” Claude

v0.9.0 release bumped 8 package.json versions but left bun.lock unsynced â†’ every CI job died at 'bun install --frozen-lockfile: lockfile had changes'. The local release gate (check-types + build) doesn't run a frozen install, so it passed locally and the break only showed in CI. A version bump must run 'bun install' and commit bun.lock, and/or the release gate should run 'bun install --frozen-lockfile'.

2026-07-12T01:35:11.239Z â€” opus-4-8 â€” Claude

speed-circuit smoke job intermittently fails with 'Chrome debugger not ready on :<port> within 30000ms' (other games boot fine, no app error) â€” a pure infra/launch-timing flake. It red-flagged a healthy main and blocked a release precondition, and the GitHub App can't rerun-failed-jobs (403), so recovery needs a fresh push. Consider bumping the smoke debugger-connect timeout or adding one retry.

2026-07-12T01:38:10.944Z â€” opus â€” Claude

screenshot workers: playwright-core expects chromium rev 1228 but /opt/pw-browsers only caches 1194 â†’ default chromium.launch() fails; must pin executablePath to /opt/pw-browsers/chromium-1194/chrome-linux/chrome

2026-07-12T01:47:51.487Z â€” sonnet â€” Claude

ship worker re-delegated instead of executing â†’ returned 'launched a worker and returning' non-answer, nearly caused a duplicate PR on already-merged history; briefs should say 'you are the worker, do not spawn sub-agents'

2026-07-12T01:47:51.521Z â€” sonnet â€” Claude

gate worker ran per-package 'bun run check-types' without 'bun scripts/ensure-ready.ts' first â†’ false RED with TS2307 on @jgengine/github (exports point at unbuilt dist/); wasted a round diagnosing a non-bug

2026-07-12T02:54:23.153Z â€” sonnet â€” Claude

ship worker returned after 21s claiming a background handoff without committing/pushing â†’ had to re-spawn a synchronous worker

2026-07-12T02:55:51.618Z â€” fable-5 â€” Claude

multi-round verify loop â†’ stop-hook demanded a commit+push after every single fix round, forcing commit churn workers mid-verification

2026-07-12T02:55:51.647Z â€” fable-5 â€” Claude

briefed a Sonnet worker to run gates â†’ it spawned its own background child and returned 'launched in background' instead of results; had to re-run with explicit foreground instruction

2026-07-12T04:20:45.614Z â€” fable-5 â€” Claude

ship worker replied 'running in background, will report' and its TaskOutput id 404'd â†’ dispatched a duplicate worker; the original had actually finished under a different task id with the commit already pushed

2026-07-12T04:59:14.718Z â€” fable-5 â€” Claude

delegated verify/screenshot workers twice re-delegated to sub-workers and returned 'waiting on the worker' as their result â†’ had to re-dispatch with explicit 'do not spawn sub-agents' briefs
2026-07-12T05:19:28.342Z â€” fable-5 â€” Claude

probe-testing new:game â†’ bun's lenient package.json parser masked a dangling comma my cleanup left; strict python json caught it â€” validate root package.json with a strict parser after scripted edits

2026-07-12T05:26:39.405Z â€” fable-5 â€” Claude

PR #563 squash-merge was a no-op: fix branch's net diff for generated/index.ts canceled against merge-base since branch already contained the clobbering commit landed separately via #550 â†’ main stayed red after 'merge'; had to re-cut a fresh branch off main as #566

2026-07-12T05:33:03.754Z â€” fable-5 â€” Claude

waited on merge-commit CI â†’ CLAUDE.md claims no Actions job exceeds ~1 min, but apps/web build now runs ~6 min; the stale claim caused a false hung-job investigation

2026-07-12T15:41:20.498Z â€” claude-opus-4-8 â€” Claude

backgrounded ship worker stalled after its gate sub-workers passed but before committing â†’ detected only via staged-but-uncommitted tree, had to stop it and take over the ship, cost several cycles

2026-07-12T15:41:20.537Z â€” claude-opus-4-8 â€” Claude

local check-types failed spuriously on stale node_modules symlinks in examples/next-host + tanstack-host (missing @games/nonogram link) â†’ needed rm -rf node_modules + bun install; main was already green

2026-07-12T15:47:53.182Z â€” sonnet-5 â€” Claude

drag-and-drop ActionBar edit â†’ ActionBar() drop handler referenced commands without calling useGame() there, check-types caught it

2026-07-12T17:33:16.570Z â€” opus â€” Claude

gen:skill-api run before node_modules finished installing silently mis-parsed several packages and overwrote scripts/api-doc-baseline.json with corrupted (dropped) entries, then surfaced only downstream as a bogus check-types 'new debt' failure â€” no error at gen time

2026-07-12T19:17:09.749Z â€” opus-4.8 â€” Claude

phase-7a ship worker pushed the branch onto pre-#595-merge history, so PR #596 showed mergeable_state=dirty; local HEAD was actually clean one-commit-on-main, fix was a force-with-lease push, not a rebase â€” a merge worker should verify origin/main's real tip before diagnosing a PR conflict

2026-07-12T20:30:18.174Z â€” opus-4.8 â€” Claude

briefed a gate worker with literal 'bun test' â†’ it scanned the whole tree unbounded (incl Games/) and hung 10min with zero output before the guard killed it; the repo gate is 'bun run test' (guarded, scoped to packages apps/dev scripts). Bare 'bun test' is a footgun in briefs.

2026-07-12T21:03:16.266Z â€” opus-4.8 â€” Claude

drive tool: guessed '--keys "s s s"' to walk the camera; that flag doesn't exist â€” it's '--key <Code>:<holdMs>' (singular, one per flag, e.g. --key KeyS:2500). CLAUDE.md's drive example only shows --click/--shot, so the movement flag is undiscoverable without --help.

2026-07-12T21:06:24.915Z â€” sonnet-5 â€” Claude

ship worker returned 'running in background, will report when done' after 1 tool-use/26s without running the gate or committing anything â€” a no-op that looked like success; had to verify git state manually and re-dispatch. Ship-motion workers should be told explicitly to perform every step synchronously in-run, not defer.

2026-07-12T22:23:41.543Z â€” sonnet â€” Claude

gate worker briefed to run gen:skill-api/check-types/test twice returned 'waiting on background work' instead of results â€” had to resume with explicit foreground-only instruction

2026-07-12T22:57:25.162Z â€” sonnet â€” Claude

merging main into a branch â†’ gen:skill-api falsely flagged 45 documented exports as new undocumented debt because packages/*/dist was stale (gitignored, JSDoc-stripped build not rebuilt) â€” bun run build before gen:skill-api fixed it, but the error message pointed at doc-writing, not a stale build

2026-07-12T23:02:02.714Z â€” fable â€” NoisemakerJon

measuring editor fps via claude-in-chrome â†’ backgrounded tab starves rAF so CDP evals time out at 45s looking like a hard page freeze; had to pivot to headless drive + in-editor PerfProbe

2026-07-12T23:02:02.831Z â€” fable â€” NoisemakerJon

check-types â†’ 445 stray compiled .js/.d.ts sitting beside src (tsgo run outside dist) blocked the artifact gate; sibling-match rm before anything could run

2026-07-12T20:40:00.000Z â€” gpt-5.6-thinking â€” ChatGPT

expensive frontier session reacted to every worker/task/GitHub transition with phase recaps, wait promises, PR-open/merge narration, CI estimates, and mid-flight papercut housekeeping â†’ dozens of unnecessary frontier turns and a git race; cap delegated work at one optional launch line plus one terminal result, treat progress events as non-conversational, and keep the entire serial ship motion inside one cheap worker return

2026-07-13T03:17:31.731Z â€” claude-opus-4-8 â€” Claude

gen:skill-api errored 'ts-morph missing; finish bun install first' but a fresh 'bun install' reported no changes/already complete â€” the message steered a wasted re-run when node_modules was actually fine (stale dist was the real cause via ensure-ready)

2026-07-13T03:45:17.053Z â€” sonnet â€” Claude

ship worker double-created the editor-overhaul PR (#650 and #651, same head sha) â†’ duplicate merged no-op PR and confusing webhook stream

2026-07-13T03:53:06.709Z â€” claude-opus-4-8 â€” Claude

multi-worker fan-out wait â†’ Stop hook 'commit your changes' fired on every quiet turn while background workers were mid-edit; committing then would have captured partial worker state. Hook can't see in-flight background agents.

2026-07-13T15:37:44.050Z â€” fable-5 â€” Claude

assets pull in cloud sandbox â†’ bun fetch dies with 'socket connection was closed unexpectedly' on release-assets.githubusercontent.com through the agent proxy (CONNECT ok, TLS stream killed); curl succeeds â€” needed a curl fallback in the CLI

2026-07-13T16:37:20.805Z â€” Sonnet 5 â€” Claude

ship motion: gen:skill-api before bun install/build produced spurious api.md diffs (removed exports) that silently reverted after gate's build step â€” re-run gen:skill-api after build, not before

2026-07-13T21:16:35.470Z â€” sonnet â€” Claude

resumed worker twice for GamePlayerShell fix ship motion, kept returning 'waiting on sub-workers' as its result without finishing â†’ needed explicit 'do not spawn sub-agents, finish it yourself' brief

2026-07-13T21:57:08.729Z â€” claude-sonnet-5 â€” Claude

wanted verbatim output from a completed background gate worker, reached for Agent(isolation:'worktree') as 'continue' â†’ spawned a stray fresh agent with a locked git worktree under .claude/worktrees/ instead of resuming context; correct move is SendMessage(to: agentId) to resume, isolation:'worktree' is only for parallel file-mutating agents

2026-07-14T04:52:11.822Z â€” claude-opus-4-8 â€” Claude

fanning out worktree-isolated issue agents in one container â†’ each agent's shell ran git setup (checkout -b) from the shared main checkout, not its worktree, so concurrent agents raced and left the main worktree HEAD on another agent's branch (had to restore my session branch); worktree isolation doesn't isolate git when the shell cwd is the main repo

2026-07-14T04:49:46.267Z â€” sonnet-5 â€” Claude

check-game-shape gate: origin/main had 3 new race primitives (idleRaceSession/placementOf/racePlacements) orphaned since PR #719, no baseline entry â†’ check-skill-api failed cold on a fresh worktree until bun run gen:skill-api --seed-baseline caught it up

2026-07-14T22:29:14.727Z â€” sonnet-5 â€” Claude

fresh cloud session: bun run dev:runner / drive failed first try (vite: command not found) â†’ node_modules wasn't installed at session start, had to bun install before any dev server/screenshot command worked

2026-07-15T02:36:13.372Z â€” opus â€” Claude

uploading PR screenshots to pr-shots via GitHub MCP create_or_update_file â†’ base64 of each PNG floods context and hand-transcribing it across subagents corrupts the bytes (truncated/garbled uploads); needed a bun run pr-shots script that hashes PNGs into git and pushes with a detached index

2026-07-15T03:25:12.661Z â€” Claude Sonnet 5 â€” Claude

shoot/drive dev server reuse (ensureDevServer's isUp(DEV_BASE) check on fixed port 4517) silently attaches to ANY already-running vite server, including a sibling worktree's â€” screenshots showed a different worktree's unmodified game code with zero indication of the mismatch

2026-07-15T03:32:50.141Z - Claude Sonnet 5 - Claude

bun run pr-shots inside a git worktree - EFAULT rm .git/pr-shots-index-<pid> - script hardcodes indexFile relative to .git assuming it's a directory, but a worktree's .git is a pointer file
2026-07-15T15:06:23.372Z - opus - Claude

bun run pr-shots crashed in a git worktree - hardcoded relative '.git/pr-shots-index-PID' path fails because .git is a file not a dir in a worktree; should use git rev-parse --absolute-git-dir

2026-07-15T15:13:00.664Z - sonnet-4.5 - Claude

shoot --keep leaves a fixed-port (4517) dev server running; a different worktree session's server squatting that port makes bun run shoot silently serve THAT session's code with no error - before/after screenshots looked identical until I noticed the PID's cwd was a different worktree

2026-07-15T15:15:01.553Z - sonnet-4.5 - Claude

pr-shots fails from a git worktree - .git is a pointer file there, not a dir, so its index-lock path (.git/pr-shots-index-N.lock) throws ENOTDIR; worked around by running it from the main checkout with --branch override

2026-07-16T00:39:44.289Z — Claude Opus 4.8 — Claude

drive/shoot hardcode DEV_PORT=4517 with no override — a concurrent worktree session already squatting that port made bun run drive silently screenshot the OTHER session's app for ~10 rounds, no error, just wrong content; had to hand-roll a private-port dev server + CDP harness to get a trustworthy shot

2026-07-16T00:44:20.180Z — Claude Opus 4.8 — Claude

bun run pr-shots fails in a git worktree checkout — it hardcodes GIT_INDEX_FILE=.git/pr-shots-index-PID, but .git is a file (not a dir) under a worktree, so git errors 'Not a directory'; had to hand-run the same plumbing with an absolute tmp index path

