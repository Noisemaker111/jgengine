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
Real bugs and feature gaps get promoted to tracked issues and removed from here;
what remains below is sandbox / environment / workflow / harness friction that
isn't a repository code fix.

---

2026-07-18T18:05:04.668Z — claude — Claude

Renaming a core export with a whole-word sed also rewrote import path specifiers (game/defineGame → game/defineGameDefinition) and bun run build still passed because package build tsconfigs exclude tests/games — a check-types or test run is the only thing that catches specifier breakage after mechanical renames

2026-07-18T20:17:34.900Z — grok-4.5 — NoisemakerJon

recovering issue-1148 custom-UI branch after stash/branch switch mid-session → work was stashed onto main and branch deleted; had to restash-pop and re-apply later edits

2026-07-18T20:41:24.709Z — gpt-5.6-sol — NoisemakerJon

verifying the standalone portable-minimap dev server with the required agent-browser skill -> the agent-browser CLI is not installed or on PATH, so verification had to fall back to the repository's Chrome/CDP shoot --url path

2026-07-18T21:07:45.656Z — gpt-5.6-sol — NoisemakerJon

cleaning up the temporary Vite visual-verification server -> the sandbox allowed starting the preview but denied stopping the exact verified PID, requiring an escalated cleanup

2026-07-18T21:09:23.828Z — gpt-5.6-sol — NoisemakerJon

following AGENTS.md's instruction to run ship:preflight immediately before shipping -> the preflight rejects any dirty implementation and also requires a committed branch diff, so the documented ordering actually requires commit first and cannot validate the exact uncommitted tree

2026-07-18T21:23:09.992Z — gpt-5.6-sol — NoisemakerJon

staging the reviewed worktree diff -> git could not create the linked-worktree index.lock under the main checkout's .git directory without escalation, despite the worktree itself being the authorized writable root

2026-07-18T22:32:42.003Z — gpt-5.6-sol — NoisemakerJon

logging a required repository papercut from this worktree -> bun run papercut reported the declared script missing, then direct Bun execution hit an EPERM sandbox read and required escalation

2026-07-18T22:37:19.095Z — gpt-5.6-sol — NoisemakerJon

running ship preflight immediately after the verified runtime-state commit -> origin/main advanced during the slice, so the branch must be rebased and verification refreshed before the PR can open

2026-07-18T22:46:09.366Z — gpt-5.6-sol — NoisemakerJon

opening the verified runtime-state PR from PowerShell -> gh pr create split multiline --body values even with a literal here-string, requiring --body-file stdin instead

2026-07-18T23:04:31.014Z — gpt-5.6-sol — NoisemakerJon

running independent recipe/surface/test/type checks for portable damage in parallel -> automatic permission review timed out after several minutes before commands ran, so verification had to be retried as one bounded sequence

2026-07-18T23:09:23.301Z — gpt-5.6-sol — NoisemakerJon

running ship preflight after the green portable damage commit -> origin/main advanced with the world API redesign during verification, requiring a final rebase and affected-check refresh

2026-07-19T05:52:23.682Z — claude-fable-5 — Claude

Fan-out research with background subagents → each agent's final report arrives truncated to ~2000 chars in the task-notification and asking the agent to Write its full report to the scratchpad silently fails (file never appears on disk, agent claims success); had to re-poke each agent to paste the full report inline as reply text, which does deliver in full.

2026-07-20T05:01:02.822Z — openai/gpt-5.6-sol — NoisemakerJon

starting the managed shoot daemon for close-up street geometry iteration on Windows -> shoot daemon start failed with Unknown: ChildProcess.kill from PowerShell instead of reporting whether the Chrome/Vite pair started

2026-07-20T05:08:56.818Z — openai/gpt-5.6-sol — NoisemakerJon

running the focused apps/web typecheck after a core geometry change -> it resolved stale @jgengine/core dist declarations and emitted dozens of false missing-export follow-ons instead of identifying that core needed rebuilding first

2026-07-20T05:45:53.185Z — openai/gpt-5.6-sol — NoisemakerJon

running the final repository gate after regenerating skill API docs -> gate stopped at a stale .claude/skills/jgengine/capabilities.md and required a separate bun run gen:capabilities pass even though this change did not add or remove a capability annotation

2026-07-20T06:20:38.630Z — openai/gpt-5.6-sol — NoisemakerJon

running the post-fixture full gate -> changing buildJunctionSurface JSDoc after an earlier generator pass left jgengine-world/api.md stale, so the full build completed before check-skill-api requested another generation

2026-07-20T06:23:44.619Z — openai/gpt-5.6-sol — NoisemakerJon

running the final gate after adding StreetGeometryPreview and regenerating export-manifest before build -> the final published export-manifest test still reported drift after all package builds, requiring regeneration against the built state

2026-07-20T06:27:26.719Z — openai/gpt-5.6-sol — NoisemakerJon

running ship:preflight immediately before commit as the workflow directs -> preflight rejects every uncommitted change as dirty and reports no net branch diff, so it can only run after the commit

2026-07-20T23:12:46.770Z — openai/gpt-5.6-sol — NoisemakerJon

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

2026-07-20T01:33:39.073Z — fable — Claude

overhauling generateCity onto the cityBlocks fabric → extractBlocks silently collapses on generateStreets output (wandered/arc-filleted centerlines defeat proximity welding: 38 streets → 2 faces, no warning), so the fabric looked adoptable but wasn't; had to add graph-exact extractGraphBlocks — extractBlocks should warn or assert when face count is implausibly low vs street count

2026-07-20T01:10:10.411Z — claude-opus-4-8 — Claude

Running bun run check-types on a clean camera-shake feature branch -> check-game-shape fails on pre-existing Games/vice-isle/src/editorKinds.ts + .test.ts (must live under src/game/), which also exists on origin/main and is unrelated to my diff; it blocks the content-gate/recipes/types stages from running.
2026-07-20T01:07:21.998Z — claude-opus-4-8 — Claude

running check-types on a fresh wave-director feature branch → gate fails on pre-existing Games/vice-isle editorKinds.ts game-shape violations on origin/main, blocking the real type check (check-types-all) that runs after it; had to run check-types-all.ts manually to confirm my code compiles

2026-07-20T03:00:06.022Z — claude-opus-4-8 — Claude

shipping #1319 re-exports: lane's focused verification (test + check-changelog + check-types) passed, but quick-CI check-skill-api failed — newly-exported types (ChargeResult/DefenseResolution/ResolvedShot) require JSDoc + a gen:skill-api regen. Focused-verification guidance for a barrel/export change should include 'if you export any new public symbol, run check-skill-api + gen:skill-api' so it doesn't only surface in CI.
bun run gate after capture workflow integration -> no engine file references the throwaway studios timed out at 5s after taking 6.8s, failing an otherwise 7475-pass gate

2026-07-21T01:23:23.388Z — openai/gpt-5.6-sol — NoisemakerJon

managed playground capture after restoring deterministic query controls -> client-only query initialization caused an SSR hydration mismatch and fail-fast capture rejection

2026-07-21T01:31:58.900Z — openai/gpt-5.6-sol — NoisemakerJon

focused cityGenerator test after fixing playground's invalid lot footprint -> current origin/main spec-city frontage assertion already exceeds its documented curb allowance (21.26 > 18.75)

2026-07-21T12:41:10.192Z — claude-opus-4-8 — Claude

Verifying #1506's drive --playtest fix on a heavy scene (wreckway) under software GL -> bun run drive's hard deadline (timeoutMs + 120s) blew during cold dev boot before producing evidence; had to warm a shoot daemon and raise --timeout to get a completed run. The same software-GL slowness #1506 addresses in the softlock verdict also needs headroom in drive's own outer deadline.

2026-07-21T15:48:57.635Z — claude-opus-4-8 — Claude

Ran an /implement backlog pass claiming #1499/#1501/#1503/#1504/#1502/#1310 via claim comments, but a second concurrent Claude session was independently working the exact same issue set at the same time and merged its own PRs (#1522/#1524/#1526) for #1501/#1503/#1504/#1499 minutes before mine landed -> real merge conflicts in scripts/agent-bootstrap.ts and packages/assets/src/cli/pull.test.ts, redundant closed-issue Closes claims, and rework to reconcile. Claim comments don't seem to be checked by other sessions before claiming the same issue; may need a stronger claim-lock signal (e.g. an assignee or label flip) that other sessions actually consult.

2026-07-24T19:23:59.959Z — grok-4.5 — NoisemakerJon

open PR after push → GitHub GraphQL/REST returns 500 empty body for pulls create (branch fix/sdk-remediation-phase-3a pushed OK; gh auth scopes fine)

2026-07-26T00:18:39.574Z — claude-opus-5 — Claude

Regenerating derived artifacts after a core API change → had to run gen:barrels, gen:capabilities, gen:skill-api and gen:export-manifest as four separate commands in the right order (and rebuild core first), with no single command and no hint from the failing check telling me which to run

2026-07-26T05:59:04.343Z — claude-opus-5 — Claude

Adding a settings surface to a game: dropped in SettingsTrigger and it rendered nothing — it returns null unless the game also declares settings:{} in game.config.ts, with no dev warning saying so. Silent no-op cost a capture round trip.

2026-07-26T05:59:04.378Z — claude-opus-5 — Claude

Capturing a game's title/menu screen: bun run shoot/drive boots vice-isle straight into play in both --mode ui and --mode play, so its title screen (and anything routed from it, like credits) cannot be captured at all.

2026-07-26T15:11:05.785Z — claude-opus-5 — Claude

Wiring ambientCG PBR maps into a game -> buildMaterialCatalog's MaterialMaps types ao/displacement as required strings, but a pack like ambientcg-metal007 ships without ao.jpg. Spreading the resolved maps onto a material 404s and hard-crashes the game with 'Could not load /materials/<id>/ao.jpg: undefined'. The JSDoc admits the files may be absent while the type says otherwise, and there is no way to ask the catalog which maps were actually pulled.

2026-07-26T16:39:05.344Z — claude-opus-5 — Claude

Creating a session handoff in a Claude cloud session -> ce-handoff's default managed store is $TMPDIR/compound-engineering-*/, but cloud sessions are ephemeral isolated containers, so /tmp is destroyed with the session and the next session can never read the handoff. The skill only warns 'discovery assumes the receiving session can see the same host filesystem' as an aside. In a cloud/container session the default should be a durable destination (GitHub issue/PR comment or a committed file), not local temp.

2026-07-26T17:39:05.009Z — claude-opus-5 — Claude

capturing a 3D game preview with bun run shoot --preview → PreviewApp marked the frame ready two rAFs after mount and ignored --settle, so every capture raced GLB loading and the model was randomly half-missing (fixed in this PR)

2026-07-26T17:39:05.068Z — claude-opus-5 — Claude

diagnosing an invisible entity model with bun run drive/shoot → neither tool forwards the page's console output, so a caught render error that already warns with the url and stack is invisible to the agent; the only way to read it was rendering the error into the DOM from a game preview

2026-07-26T17:39:05.119Z — claude-opus-5 — Claude

verifying an enemy model in the-robots with bun run drive --spawn → enemies wander, so the same spawn+yaw shows robots in one run and empty desert in the next; roughly ten 2-minute capture runs went into 'is it invisible or is nothing there', which a deterministic entity preview solved in one

2026-07-26T18:02:26.236Z — claude-opus-5 — Claude

adding a field to SkyEnvironmentConfig → sky() copies config fields one by one, so the new field typechecked everywhere and silently did nothing at runtime; three capture rounds went into 'why is the sky still grey' before reading the factory. Every world feature factory has this shape

2026-07-26T18:59:33.308Z — claude-opus-5 — Claude

verifying any world content with shoot/drive → the only aiming primitive was --spawn, which moves the player but does not pin look yaw, so framing a known coordinate took repeated capture rounds and often never worked; fixed by --look in this PR

2026-07-26T19:36:32.979Z — claude-opus-5 — Claude

Waiting on a background `bun run gate` with `until pgrep -f 'run-stages.ts gate'; do sleep; done` never exits — the watcher shell's own command line contains the pattern, so pgrep matches itself. Cost ~15 wasted wake cycles before I noticed. A documented wait-for-background-command idiom (or pgrep guidance) would help.

2026-07-26T19:36:33.037Z — claude-opus-5 — Claude

Ran `bun run gate` and `bun run drive the-robots` concurrently on the software-GL cloud box; they starved each other and the 20s key-hold drive took ~20 min. Nothing warns that capture and gate should not overlap on a GL-less host.

2026-07-26T19:44:00.696Z — claude-opus-5 — Claude

RESOLVED by #1608, and my diagnosis was wrong: `--look x,z,dist,height[,angle]` was my own misuse — `--look` takes the aim point only and distance/height/angle belong in `--look-from`. The old parser silently aimed somewhere else, so I got black viewports and blamed a streaming race. #1608 now rejects the ambiguous arity with the exact corrected command, which is what unblocked me. Keeping the entry as a record that a silently-misparsed camera arg cost ~8 capture rounds.

2026-07-26T20:25:15.978Z — claude-opus-5 — Claude

WITHDRAWN: `--settle` was not being ignored — the run it was measured on failed argument parsing before settle mattered (see the --look entry above). A correct `--look 0,0 --look-from 30,4,110` run reported settle=2.96s as asked.
2026-07-26T21:25:13.908Z — claude-opus-5 — Claude

Capturing a before shot for a PR: git checkout main in a cloud session gave a silently stale main (behind origin/main by many commits), so shoot rejected a flag that exists on the real tip and reported it as an unknown game id. Had to detach onto origin/main. Cloud sessions clone a branch, so local main is never current — baseline captures should use origin/main, and the stale-local-main case is worth detecting.

2026-07-26T22:27:08.120Z — claude-opus-5 — Claude

shoot the-robots twice with identical flags → one run captured with settle=1.51s and every dead tree missing from the frame, the next with settle=13.67s had them; default settle does not wait on modelLoadIdleMs so a capture can silently ship a half-loaded scene that looks like a content regression

2026-08-01T08:35:53.942Z — claude-opus-5 — Claude

shoot: capturing a game with persist:true on the warm daemon → the Chrome profile's localStorage save is restored, so three capture rounds silently framed a world pinned to an OLD editor.scene.json spawn while the dev server was serving fresh modules; drive clears origin storage by default but shoot has no equivalent flag

2026-08-01T08:36:03.319Z — claude-opus-5 — Claude

lighting.directional[].shadowCameraSize is inert: SceneLighting passes it as shadow-camera-left/right/top/bottom props and nothing calls shadow.camera.updateProjectionMatrix(), so three keeps the default 10x10 ortho box at the world origin and an open-world game gets no cast shadows anywhere

2026-08-01T08:36:03.355Z — claude-opus-5 — Claude

lighting cascades: three's CSM mounts one directional light PER cascade at the configured intensity, so cascades:4 silently quadruples the sun and blows the scene white; its patchSceneMaterials also only re-scans every 30 frames, which on software-GL capture is minutes, so streamed models never receive CSM shadows in a shot

2026-08-01T08:36:03.415Z — claude-opus-5 — Claude

sky({ zenithColor, horizonColor }) with timeOfDay:true only sets the NOON keyframe of the daylight curve — at any other time.start the authored colours are cross-faded with the engine dawn/dusk presets, so an authored tropical blue renders pink with no warning
