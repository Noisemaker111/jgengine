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

2026-07-18T15:28:59.258Z — claude-fable-5 — NoisemakerJon

driving screenshots via 'bun run drive' with --rpc JSON → guard.ts arg requoting corrupts the JSON payload (Unterminated string); had to invoke scripts/drive-dev.ts directly

2026-07-18T15:46:51.967Z — claude-fable-5 — NoisemakerJon

Shooting close-ups from different vantage points → no way to override player spawn per-shot; had to mutate editor.scene.json player_spawn via python heredocs three times and hand-restore. shoot needs a --spawn x,y,z flag / ?spawn= URL param overlay (like ?cam=) so screenshots never mutate authored scene content.

2026-07-18T16:51:34.018Z — claude-fable-5 — Claude

capturing editor screenshots in the dev runner → 'assets pull' run from repo root provisions public/models at the repo root, but apps/dev serves apps/dev/public — the runtime error's suggested fix leaves the dev runner still 404ing until the pack is copied into apps/dev/public/models

2026-07-18T16:54:13.275Z — claude-fable-5 — NoisemakerJon

gate/test:all in the cloud container → 7 pre-existing failures identical on origin/main: msys tar parses 'C:\...' as a remote host (Cannot connect to C: resolve failed) in tarball clean-consumer tests, plus 3 model-pack texture-URI tests; gate can never pass locally on Windows containers — needs tar --force-local or bsdtar and a look at the pack tests

2026-07-18T16:59:02.348Z — cloud-agent — Claude

Running bun run gate on a fresh cloud container → agent:preflight fails on missing node_modules before build's ensure-ready --install-only can run; had to bun install manually first. Preflight could auto-install or point at ensure-ready.

2026-07-18T17:17:53.370Z — claude-fable-5 — Claude

Cold cloud container: 'bun run shoot' fails with 'Dev server failed to start' until 'bun scripts/ensure-ready.ts' has run once — shoot should bootstrap deps itself or say to run ensure-ready

2026-07-18T17:39:17.438Z — cloud-agent — Claude

Fresh branch off origin/main can't pass its own gate: check-content-gate fails because coordinate-literal-baseline.json lists Games/the-robots/src/game/world/zones.ts which no longer trips the lint (baselines only shrink). Every session that runs the gate hits this red before touching any real work — the shrinking baselines need reseeding on main (bun run check-content-gate --update) or a CI job that keeps them trimmed.

2026-07-18T17:39:17.470Z — cloud-agent — Claude

gen:capabilities has no encoding guard: the container's non-UTF-8 locale (LANG=, LC_CTYPE=POSIX) let mojibake em/en-dashes get committed into core JSDoc (gameContext.ts, commandApply.ts). check-capabilities then only reported 'stale — run gen:capabilities', and running that FIX faithfully copies the corruption into the committed skill docs. A cheap grep for the mojibake byte-signature in the gate (or in gen-capability-index) would catch corruption at the source instead of laundering it through the generator. (Locale now pinned to C.UTF-8 in .claude/settings.json to stop new corruption.)

2026-07-18T17:25:53.270Z — claude-fable-5 — Claude

Capturing baseline city screenshots on a fresh cloud container → bun run shoot failed with 'Dev server failed to start on :4715' because node_modules was missing; the error never hints that vite is absent / bun install is needed

2026-07-18T18:14:30.036Z — claude-fable-5 — Claude

Running bun run gate on a fresh branch off main → check-capabilities failed because jgengine-multiplayer/jgengine-ui capabilities.md were already stale on main (host-join-code-gate, hud-layout-persist rows missing); had to fold unrelated regenerated rows into my PR to get the gate green

2026-07-18T18:15:30.730Z — claude-fable-5 — Claude

bun run gate on fresh branch off main → check-content-gate failed on a stale coordinate-literal-baseline.json entry (Games/the-robots zones.ts no longer trips the lint); main ships with a red gate until someone reseeds
2026-07-18T18:05:04.668Z — claude — Claude

Renaming a core export with a whole-word sed also rewrote import path specifiers (game/defineGame → game/defineGameDefinition) and bun run build still passed because package build tsconfigs exclude tests/games — a check-types or test run is the only thing that catches specifier breakage after mechanical renames


2026-07-18T22:43:40.443Z — claude-fable-5 — Claude

world redesign PR: main is broken — packages/editor/src/EditorChrome.tsx had a duplicate ')}' (merge #1176) that fails 'bun run build'; agent:bootstrap earlier reported success anyway, so the breakage only surfaced mid-task at gen:skill-api
2026-07-18T20:17:34.900Z — grok-4.5 — NoisemakerJon

recovering issue-1148 custom-UI branch after stash/branch switch mid-session → work was stashed onto main and branch deleted; had to restash-pop and re-apply later edits

2026-07-18T20:23:57.542Z — gpt-5.6-sol — NoisemakerJon

creating the required isolated worktree under C:\tmp -> Bun returned EPERM/No package.json there, and a nested ignored worktree then resolved scripts against the parent checkout; worktrees need a documented Bun-safe location outside the repository

2026-07-18T20:24:06.560Z — gpt-5.6-sol — NoisemakerJon

locating API adoption routing for the minimap slice -> the expected scripts/api-adoption.json path does not exist, so generator ownership was not discoverable by filename

2026-07-18T20:24:14.469Z — gpt-5.6-sol — NoisemakerJon

running a focused package typecheck from a nested worktree -> 'bun run --cwd packages/core check-types' resolved as the parent checkout's root build/check, wrote ignored dist output there, and failed on unrelated stale editor API artifacts; package-cwd syntax and worktree discovery were dangerously ambiguous

2026-07-18T20:30:09.213Z — gpt-5.6-sol — NoisemakerJon

running affected-package typechecks after a clean frozen install -> react/shell emitted hundreds of missing @jgengine/* modules because package checks require upstream dist builds but neither the script nor error explains that prerequisite

2026-07-18T20:41:24.709Z — gpt-5.6-sol — NoisemakerJon

verifying the standalone portable-minimap dev server with the required agent-browser skill -> the agent-browser CLI is not installed or on PATH, so verification had to fall back to the repository's Chrome/CDP shoot --url path

2026-07-18T20:43:17.752Z — gpt-5.6-sol — NoisemakerJon

capturing an arbitrary standalone React URL with bun run shoot --url -> the documented command timed out because shoot silently requires the page to set data-jg-capture=ready, a contract missing from --help

2026-07-18T20:54:16.196Z — gpt-5.6-sol — NoisemakerJon

running bun run build on the fresh portable-capability branch -> unrelated packages/editor/src/shell/HierarchyPanel.tsx failed TS6133 because an ids parameter is unused on the branch's origin/main base

2026-07-18T20:56:08.573Z — gpt-5.6-sol — NoisemakerJon

regenerating skill API on current origin/main for the portable marker exports -> check-skill-api fails on 11 unrelated newly exported editor helpers with no consumer import or capability tag, so main's generated API gate is red after the editor follow-up merges

2026-07-18T21:07:01.236Z — gpt-5.6-sol — NoisemakerJon

running the full suite on current origin/main for the portable minimap slice -> exportManifest.test.ts fails because six newly exposed editor subpaths are absent from scripts/export-manifest.json, so main's published-export gate is red independently of this change

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

2026-07-18T21:45:58.260Z — gpt-5.6-sol — NoisemakerJon

running a focused core typecheck with bun --cwd packages/core run check-types -> Bun exited 0 after printing help instead of executing the script; invalid command ordering should not report success

2026-07-18T21:57:19.685Z — gpt-5.6-sol — NoisemakerJon

regenerating scripts/export-manifest.json for the new core/stats/statPool subpath -> current origin/main also injects six unrelated stale editor subpaths, so the scoped change had to remove those generated rows and the baseline manifest gate remains red

2026-07-18T21:58:37.034Z — gpt-5.6-sol — NoisemakerJon

running the isolated packed-core stat-pool import smoke test -> Windows tar extraction was killed at the explicit 30s test budget after a dangling process warning; real-tarball tests need a Windows-safe extractor or a larger filesystem budget

2026-07-18T22:08:50.506Z — gpt-5.6-sol — NoisemakerJon

running bun run gate for the stat-pool slice -> the build phase exited 255 immediately after launching the editor package build with no compiler diagnostic, so the full gate did not identify a failing source or check

2026-07-18T22:13:40.362Z — gpt-5.6-sol — NoisemakerJon

retrying the full gate after the isolated editor build passed -> 6337 tests passed, but five unchanged tarball-content cases and installPackagedSkills exceeded Bun's default 5s timeout under Windows filesystem contention, alongside the known six-subpath editor export-manifest drift

2026-07-18T22:23:17.244Z — claude — Claude

ran bun run gate for a scripts/docs change → gate is already red on main: check-skill-api reports 14 unadopted editor exports (LightingPanel, AnimationPanel, pathFlythrough, materialAssignments, networkSnapshot, skyConfigFromEnvironment) from the merged issue-1110 PRs and a stale jgengine-editor api.md

2026-07-18T23:02:42.440Z — fable — Claude

drive --shot <value>: passing an absolute path breaks (script builds shots/<game>-<path>.png → ENOENT); only bare names work, flag docs don't say so

2026-07-18T23:02:42.473Z — fable — Claude

editor CLI: export_document returns result.json but import_document with a wrong param key fails with 'JSON Parse error: Unexpected identifier undefined' instead of naming the expected 'json' param

2026-07-18T23:02:42.508Z — fable — Claude

editor CLI has no add_path verb — authoring a new route path headlessly requires a full export_document/import_document roundtrip

2026-07-18T23:02:42.541Z — fable — Claude

shoot daemon: after editing a game's scene/code while daemon is live, play capture fails twice with 'start menu still on screen' until daemon stop/start — daemon page goes stale on HMR

2026-07-18T23:09:33.687Z — fable — Claude

vice-isle drive rpc editor_summon: editor host mounts then React 'Maximum update depth exceeded' loop in editor shell ContentBrowser/AssetThumbnail — page goes black, editor verbs unreachable (wanted an editor-view screenshot of authored paths)

2026-07-18T23:13:44.098Z — claude-fable-5 — NoisemakerJon

Running bun run gate on Windows for the 0.12.0 release → scripts/tarballInstall.test.ts fails 3 tests because GNU tar treats C:\... as a remote host (Cannot connect to C: resolve failed); needs --force-local or forward-slash paths on win32

2026-07-18T23:13:44.222Z — claude-fable-5 — NoisemakerJon

bun run gate on main (pre-release recon) → scripts/packTextures.test.ts fails for kaykit-skeletons, quaternius-medieval-village, quaternius-modular-scifi: external image URIs unresolved and packs not in KNOWN_UNRESOLVED_PACKS allowlist; failing on a clean main checkout on Windows

2026-07-18T23:42:10.479Z — fable — Claude

drive vice-isle --key KeyW:12000: player never moves (three identical shots from spawn) — play-mode keys appear to need pointer lock or focus the drive script doesn't provide; blocks driving-to-location captures

2026-07-19T01:39:48.041Z — claude-opus-4-8 — Claude

Shipping PR #1223 (merged, required CI green, typecheck clean across 32 workspaces) → Vercel preview deploy for apps/web reported FAILED/Error on the PR. Non-blocking (auto-merge still landed), but a red preview status on an otherwise-green additive PR is noise; worth confirming whether apps/web preview build fails independent of the change.
