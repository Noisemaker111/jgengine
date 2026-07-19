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

2026-07-18T16:51:34.018Z — claude-fable-5 — Claude

capturing editor screenshots in the dev runner → 'assets pull' run from repo root provisions public/models at the repo root, but apps/dev serves apps/dev/public — the runtime error's suggested fix leaves the dev runner still 404ing until the pack is copied into apps/dev/public/models

2026-07-18T16:54:13.275Z — claude-fable-5 — NoisemakerJon

gate/test:all in the cloud container → 7 pre-existing failures identical on origin/main: msys tar parses 'C:\...' as a remote host (Cannot connect to C: resolve failed) in tarball clean-consumer tests, plus 3 model-pack texture-URI tests; gate can never pass locally on Windows containers — needs tar --force-local or bsdtar and a look at the pack tests

2026-07-18T18:05:04.668Z — claude — Claude

Renaming a core export with a whole-word sed also rewrote import path specifiers (game/defineGame → game/defineGameDefinition) and bun run build still passed because package build tsconfigs exclude tests/games — a check-types or test run is the only thing that catches specifier breakage after mechanical renames

2026-07-18T20:17:34.900Z — grok-4.5 — NoisemakerJon

recovering issue-1148 custom-UI branch after stash/branch switch mid-session → work was stashed onto main and branch deleted; had to restash-pop and re-apply later edits

2026-07-18T20:24:06.560Z — gpt-5.6-sol — NoisemakerJon

locating API adoption routing for the minimap slice -> the expected scripts/api-adoption.json path does not exist, so generator ownership was not discoverable by filename

2026-07-18T20:41:24.709Z — gpt-5.6-sol — NoisemakerJon

verifying the standalone portable-minimap dev server with the required agent-browser skill -> the agent-browser CLI is not installed or on PATH, so verification had to fall back to the repository's Chrome/CDP shoot --url path

2026-07-18T21:07:45.656Z — gpt-5.6-sol — NoisemakerJon

cleaning up the temporary Vite visual-verification server -> the sandbox allowed starting the preview but denied stopping the exact verified PID, requiring an escalated cleanup

2026-07-18T21:09:23.828Z — gpt-5.6-sol — NoisemakerJon

following AGENTS.md's instruction to run ship:preflight immediately before shipping -> the preflight rejects any dirty implementation and also requires a committed branch diff, so the documented ordering actually requires commit first and cannot validate the exact uncommitted tree

2026-07-18T21:10:28.446Z — gpt-5.6-sol — NoisemakerJon

combining tarball consumer tests with barrel generators in one focused bun test run -> the unchanged core clean-consumer test exceeded its default 5s timeout under contention even though the same tarball suite passes alone; focused verification commands need isolation or explicit timeouts

2026-07-18T21:15:03.831Z — gpt-5.6-sol — NoisemakerJon

rerunning scripts/tarballInstall.test.ts after one timeout adjustment -> repeated npm pack filesystem work hung beyond the 120s command guard with no streamed test output; clean-consumer validation needs per-case filtering or shared pack artifacts on Windows

2026-07-18T21:23:09.992Z — gpt-5.6-sol — NoisemakerJon

staging the reviewed worktree diff -> git could not create the linked-worktree index.lock under the main checkout's .git directory without escalation, despite the worktree itself being the authorized writable root

2026-07-18T21:58:37.034Z — gpt-5.6-sol — NoisemakerJon

running the isolated packed-core stat-pool import smoke test -> Windows tar extraction was killed at the explicit 30s test budget after a dangling process warning; real-tarball tests need a Windows-safe extractor or a larger filesystem budget

2026-07-18T22:13:40.362Z — gpt-5.6-sol — NoisemakerJon

retrying the full gate after the isolated editor build passed -> 6337 tests passed, but five unchanged tarball-content cases and installPackagedSkills exceeded Bun's default 5s timeout under Windows filesystem contention, alongside the known six-subpath editor export-manifest drift

2026-07-18T22:32:42.003Z — gpt-5.6-sol — NoisemakerJon

logging a required repository papercut from this worktree -> bun run papercut reported the declared script missing, then direct Bun execution hit an EPERM sandbox read and required escalation

2026-07-18T22:37:19.095Z — gpt-5.6-sol — NoisemakerJon

running ship preflight immediately after the verified runtime-state commit -> origin/main advanced during the slice, so the branch must be rebased and verification refreshed before the PR can open

2026-07-18T22:46:09.366Z — gpt-5.6-sol — NoisemakerJon

opening the verified runtime-state PR from PowerShell -> gh pr create split multiline --body values even with a literal here-string, requiring --body-file stdin instead

2026-07-18T23:13:44.098Z — claude-fable-5 — NoisemakerJon

Running bun run gate on Windows for the 0.12.0 release → scripts/tarballInstall.test.ts fails 3 tests because GNU tar treats C:\... as a remote host (Cannot connect to C: resolve failed); needs --force-local or forward-slash paths on win32

2026-07-18T23:43:25.224Z — claude-opus-4-8 — NoisemakerJon

verifying per-game adoption changes → the CLAUDE.md-documented 'bun --cwd <path> run <script>' (space form) mis-parses and prints bun-run help instead of running; only 'bun --cwd=<path> run <script>' (equals form) works. Docs/skills should switch to the = form or bun --filter.

2026-07-18T23:54:36.309Z — claude-fable-5 — NoisemakerJon

Consumer sim: WoW-like needed overhead enemy nameplates/healthbars; jgengine-ui has bars but no floating world-anchored entity-frame seam or recipe, so it drops off agent plans

2026-07-18T23:54:36.309Z — claude-fable-5 — NoisemakerJon

Consumer sim: standalone projects have no screenshot/verify tool — shoot/drive are monorepo scripts — so the AGENTS.md rule 'visual claims are screenshot-judged harshly by you' is unenforceable for exactly the outside users it targets; ship a jgengine shoot CLI verb

2026-07-19T00:10:56.438Z — claude-fable-5 — NoisemakerJon

Consumer sim: an 'all robots' game found zero robot/mech character models in the @jgengine/assets index (only fantasy adventurers/skeletons are rigged) — had to hand-pull Quaternius Animated Robot / Robot Enemy / Mech GLBs from poly.pizza into public/models as extras. Mirror a Quaternius robot pack into the asset index

2026-07-18T23:04:31.014Z — gpt-5.6-sol — NoisemakerJon

running independent recipe/surface/test/type checks for portable damage in parallel -> automatic permission review timed out after several minutes before commands ran, so verification had to be retried as one bounded sequence

2026-07-18T23:09:23.301Z — gpt-5.6-sol — NoisemakerJon

running ship preflight after the green portable damage commit -> origin/main advanced with the world API redesign during verification, requiring a final rebase and affected-check refresh

2026-07-19T04:40:07.134Z — fable — Claude

verifying vice-isle movement fix → bun run drive --playtest in the cloud container runs headless Chrome at ~2 fps software GL (1.2M tris), so held-key movement barely advances and every game reads as a false SOFTLOCK (wreckway: 2 probe frames in 8s); playtest rung is unusable here, had to fall back to deterministic headless stepPlayerMovement evidence

2026-07-19T04:59:59.942Z — claude-fable-5 — Claude

releasing 0.14.0 → bun test scripts fails on a clean main checkout: packages/core/src/world.ts barrel is out of sync with gen-barrels output (scatterCoverage symbol ordering from #1279); had to regenerate and fold the fix into the release PR

2026-07-19T05:52:23.682Z — claude-fable-5 — Claude

Fan-out research with background subagents → each agent's final report arrives truncated to ~2000 chars in the task-notification and asking the agent to Write its full report to the scratchpad silently fails (file never appears on disk, agent claims success); had to re-poke each agent to paste the full report inline as reply text, which does deliver in full.

2026-07-19T06:14:30.443Z — claude-fable-5 — Claude

Running bun run gate on a fresh branch off main → check-content-gate fails on a stale content-builder-baseline.json entry (Games/vice-isle/src/world.ts:building) that main's own migration removed without reseeding — main's gate is red for unrelated work until someone runs check-content-gate --update

2026-07-19T06:22:33.518Z — claude-fable-5 — Claude

running bun run gate on a fresh branch off main → check-content-gate red on a stale content-builder-baseline.json entry (Games/vice-isle/src/world.ts:building already migrated); had to reseed the baseline inside an unrelated PR to get a green gate

2026-07-19T07:09:44.388Z — claude-fable-5 — Claude

gen:export-manifest reads built dist, so generating before a full package build silently omits new subpaths (bit #1300's useDisposable and nearly my ai/driver) — manifest check only fails later on a fully-built tree; generator should build or warn on stale dist

2026-07-19T03:57:16.316Z — fable — Claude

Adding an /agents.md server route to apps/web → Vite dev static middleware intercepts .md URLs and 404s before TanStack SSR sees them, while .txt/.xml server routes work; had to ship the brief as /llms-full.txt instead

2026-07-19T04:20:12.828Z — claude-fable-5 — Claude

Fixing production 404 for quaternius-modular-scifi models → content gate accepts 'provisioned' pack refs, but the Vercel /play build only ships committed packs, so games can merge referencing packs production can never serve (the-robots, tower-guard hit this); also kaykit-space-base was committed without a .gitignore whitelist entry

2026-07-19T07:37:41.988Z — claude-fable-5 — Claude

screenshotting the website: 'bun run shoot --url http://localhost:3000/...' errors 'nothing is listening' even when our dev server owns that port — only http://127.0.0.1:... passes the allowlist, and the error message doesn't mention that 127.0.0.1 URLs are accepted

2026-07-19T17:09:58.949Z — claude-fable-5 — Claude

bun run gate → packages/assets src/cli/pull.test.ts failed once in the full test:all run (offline pull found empty /tmp dir) but passes in isolation; flaky network/tmpdir-dependent test forced a full gate re-run

2026-07-19T17:14:06.870Z — claude-fable-5 — Claude

bun run gate fails on clean origin/main: scripts/exportManifest.test.ts — computed manifest has ./previewFixtures and ./harness subpaths missing from the committed manifest (likely #1336 landed without regenerating it); gate is red for every branch until regenerated

2026-07-19T18:22:26.329Z — claude-opus — Claude

capturing before/after terrain shots → 'bun run drive --shot' rejects an absolute path with a hard error (takes a bare name, output forced to shots/<game>-<name>.png), while 'bun run shoot --out' accepts a full path — the two capture entrypoints disagree on how you name the output file
2026-07-19T18:26:23.894Z — claude-fable-5 — Claude

running bun run gate for a touch-controls PR → gate is red on main itself: check-game-shape flags Games/vice-isle/src/editorKinds.ts(+test) from merged #1369 as off-shape, masking my own results; the offending PR landed without gate catching it

2026-07-19T20:38:47.201Z — claude-fable-5 — Claude

Running bun run gate on a fresh branch off origin/main → check-game-shape fails on pre-existing Games/vice-isle/src/editorKinds.ts(+test) placement, aborting the gate before test:all for unrelated PRs

2026-07-19T20:41:47.420Z — claude-fable-5 — Claude

test:all on a fresh branch → scripts/exportManifest.test.ts fails because export-manifest.json drift (editor ./camera/orbitFraming, ./harness) landed on main unregenerated — the PR quick CI job doesn't run this test, so drift only surfaces on later unrelated branches

2026-07-19T21:06:59.865Z — claude-fable-5 — Claude

recording a drive on the warm Chrome reused the profile's localStorage save — vice-isle restored the previous run's session and capture.probe read 0,0,0; fresh-profile drives (no --connect) were needed for honest recording runs

2026-07-19T21:08:15.220Z — claude-fable-5 — Claude

bun run gate fails on current main: check-game-shape rejects Games/vice-isle/src/editorKinds.ts(+test) from merged PR #1369 — either the files move under src/game/ or editorKinds*.ts joins the optional top-level extras

2026-07-19T21:58:56.045Z — claude-opus-4-8 — Claude

driving the-robots for tracer evidence → 'bun run drive' crashes with 'Cannot find package gifenc from scripts/gif.ts'; gifenc not installed after agent:bootstrap

2026-07-19T22:40:53.030Z — claude-opus-4-8 — Claude

bun run agent:bootstrap on a fresh worktree failed: shell build could not find @jgengine/core/vfx/screenEffects because core dist was stale/incomplete from a prior partial build; a plain rebuild of core then full build succeeded

2026-07-19T22:40:53.111Z — claude-opus-4-8 — Claude

bun run gate is red on origin/main (check-game-shape flags Games/vice-isle/src/editorKinds.ts + .test.ts as game-specific files that must live under src/game/) — unrelated to my change but the && chain short-circuits before check-types-all runs, masking the real verdict
