---
name: jgengine-verify
description: Before claiming a change works, looks right, or ships, prove it: screenshots, gameplay, scene data.
---

# JGengine verification

Verification follows risk: cheapest deterministic evidence first, visual/browser evidence only for claims pixels or interaction uniquely prove. The default rungs below work in any JGengine project (a created standalone game included); engine-repository commands live in their own section at the end.

## Core ladder

1. Run the project's focused type/tests while iterating (`bun run check-types`, `bun test src`).
2. Assert pure rules and serialized transitions in tests.
3. Assert scene/environment data through `summarizeEnvironment`, voxel summaries, or authored-document queries.
4. Exercise gameplay progress when the loop can softlock.
5. Capture and inspect screenshots only for visual/layout/integration claims.

## Choose evidence

Classify each acceptance claim before scheduling proof. A plan that uses screenshots where deterministic evidence suffices is incomplete.

| Claim | Primary proof | Screenshot policy |
| --- | --- | --- |
| rules, combat, progression, persistence | focused unit or gameplay tests | do not capture |
| authored or generated world content exists | scene queries, `summarizeEnvironment`, or serialized-document assertions | do not capture merely to prove existence |
| performance | `debug_snapshot` simulation and render metrics | do not photograph an fps counter |
| layout, lighting, framing, or visual fidelity | pixel metrics plus an inspected screenshot | capture only the states and viewports named by the claim |

## Scene and gameplay proof

- Generated worlds assert resolved counts, finite/non-flat terrain where expected, palettes, bounds, and required features.
- Authored worlds assert required layers, objects, paths, markers, and ids from `editor.scene.json`.
- Gameplay tests prove the observable acceptance scenario, including save/restore or multi-client behavior when changed.
- Time-based headless tests: `HeadlessRunner.step(dt)` clamps every step to `maxStepSeconds` (default 0.05 s) no matter what dt you pass — `step(5)` advances the sim by 0.05 s, not 5 s, so a timer that "never fires" is usually this clamp, not a bug. Advance game time with many small steps (~20 per second of game time, e.g. `for (…) runner.step(1 / 60)`), or raise `maxStepSeconds` in the runner options when coarse fixed steps are intended.
- For interactive softlock/progress proof, drive input and interrogate `window.__jgengineAgent.handle({ method: ... })` — `agent_status`, `debug_snapshot`, and the editor verbs work headlessly on any running game page. In a created standalone game the one command for all of this is `bun run drive` (`scripts/drive.mjs`, shipped in the scaffold): ordered `--click`/`--key`/`--wait`/`--shot` steps, `--rpc '{"method":"agent_status"}'` for the bridge, and `--playtest --strict` for the softlock rung — never hand-roll a Playwright/Puppeteer/CDP script or a bespoke Vite consumer for this. A browser tool on the `bun dev` page is the fallback, not the default.
- Placeholder-vs-authored: `debug_snapshot().probes.fallbacks` reports which render seams resolved to fallbacks (green ground, primitive actors, proxy scatter) and why — a non-empty count proves content is unauthored/misconfigured rather than an intended placeholder.
- UI-flow logic (a command/intent handler, not its pixels): drive it canvas-free with `createHeadlessRunner(...).ui.invoke("intent.name", input)`, then assert the resulting reactive state off `ctx` (store, stats, scene). No renderer, no pointer simulation — leave pixels to `shoot`; prove the logic headlessly.

## Performance proof

When a game is reported slow, play it and pull the debug menu's perf data instead of guessing:

1. Run the game (`bun dev`), warm it up, call `debug_perf_reset` through the agent bridge (or F2+D's Perf panel), play the hot path, then take a `debug_snapshot` — reset drops load/shader-compile stalls from the frame window; the snapshot's `why` line names the culprit.
2. Read `frame.avgSimMs` vs `frame.avgOutsideMs`: sim-heavy means game logic (wrap hot `onTick` work in `measure("name", fn)` and re-snapshot; phases rank themselves); outside-heavy means render/GPU — check `render.drawCalls`/`render.triangles` and the long-frame log.
3. Fix at the owning seam, then re-run the same sequence and report before/after `avgFrameMs` + `render` counts as the evidence pair. Draw/triangle counts are deterministic and survive slow CI hardware; raw fps there is not the player's fps.
4. In-browser, F2+D opens the same data as the Perf panel; `debug_report` returns the unabridged snapshot.

## Visual proof

**Created standalone game (outside the monorepo):** run `bun run shoot` (or `node scripts/shoot.mjs`, shipped in the scaffold). It starts the dev server if needed, forces a real viewport so the WebGL canvas is not stuck at R3F's 300×150 default, waits for an honest frame, and captures headless to `shots/shot.png` — no daemon, no npm deps. Flags: `--device desktop|mobile|mobile-landscape`, `--url`, `--out`, `--settle`, `--timeout`; `--help` for all. For shots that need play first (menus clicked through, keys held, RPC state set up), use the scaffold's `bun run drive` with `--shot` steps instead of scripting a browser by hand. The daemon workflow below is the richer engine-monorepo path; the single-shot scripts are the portable rungs the created game ships.

Inside the engine monorepo, start one managed capture session before the first visual shot:

1. Run `bun run shoot daemon start`. The command must report a live Chrome/Vite pair; a non-zero exit means visual capture is unavailable, not permission to repeat cold foreground launches.
2. Iterate with `bun run shoot <game> --mode play --size half --inspect`. Plain `shoot` auto-attaches to the live daemon; reuse it for every state or viewport in the loop.
3. Reject blank, sparse, overflow, and collision failures from the metrics pass before opening a PNG. Open only captures whose claim truly needs visual judgment.
4. Capture the final accepted state at full resolution, then embed final visual evidence with `bun run pr-shots`.

Do not run bare cold `shoot` or `drive` commands repeatedly in a multi-shot loop. If the managed daemon cannot stay live, stop retrying the same browser path and report the capture failure with deterministic evidence from the lower rungs.

**Arbitrary URLs (`shoot --url`):** the page must set `document.documentElement.dataset.jgCapture = "ready"` (HTML `data-jg-capture="ready"`) when the frame is honest; set `data-jg-capture="error"` with `data-jg-capture-error` on failure. Prefer in-repo `shoot <game>` / daemon over a hand-rolled Vite consumer. If capture fails twice for the same setup, stop and fall back to deterministic evidence — do not invent alternate browser stacks.

Screenshots come from the game's own dev server. Read every screenshot adversarially: assume it is broken and hunt for the flaw. A shot is evidence to be prosecuted, not a formality to wave through. Comb the frame region by region at full size — corners, edges, and background included — never sign off on a glance. Optimism here is a defect: "looks good" on a broken frame is worse than no capture, because it launders a bug into a completion claim.

- Judge against the brief, not against "a working build". When the task names a target — a reference game, a mockup, a design doc, "make it look like X" — that target is the bar. Put the reference beside the shot and compare feature by feature: terrain treatment, unit and building silhouettes, HUD layout and console, resource/economy model, palette, camera angle. A slice that runs but resembles the target in nothing is a **fail**, not a pass. "It is only a vertical slice" narrows the *scope* of what is claimed; it never lowers the bar for what is actually in frame. If the shot shares almost nothing with the named target, say so plainly and score it a fail — do not credit it for booting.
- Enumerate defects before you judge. Walk the frame and name what is actually wrong: clipping and z-fighting, stretched/low-res/placeholder textures, misaligned, overlapping, or clipped UI, cut-off or overflowing text, wrong anchors and off-screen elements, seams and gaps, flat/black/blank regions (an unrendered corner or blown-out sky is a render bug, not lighting), missing shadows or lighting, jagged or aliased edges, colour banding, default/untextured primitives, repeated identical silhouettes. Only after that itemized pass may you state a verdict, and the verdict must name what you checked.
- One visible bug is a fail. If any defect is present in the shot, the claim is not proven — report the defect and its pixel location, do not average it away, talk yourself out of it, or call the overall look acceptable "apart from" it. Fix it or narrow the claim and re-capture.
- Never write "all good", "looks good", "ships", or an equivalent sign-off without an accompanying list of what you inspected and what, if anything, you found. A bare approval with no itemized pass is not a review.
- Use deterministic preview states for HUD/menu captures; use live play for integration and scene look.
- Menu-gated games declare `capture.play`/`capture.states` (see `GameCaptureConfig`) rather than hand-driving setup repeatedly. `capture.play` dispatches once at context-ready; if a play-mode shot fails with "a start menu still on screen" while `play` *is* declared, an async boot step (whole-world save restore, hydration) is resetting the start gate after those commands ran — fix the game so the restore preserves an already-live session, not the capture command.
- Inspect desktop and mobile when responsive UI changes.
- Run pixel inspection for blank/sparse/contrast regressions, then open the PNG and judge it against the UI scorecard.
- If a WebGL capture hangs once, do not repeat the same foreground command; fall back to deterministic scene evidence and report the capture failure.

## Evidence report

Report each applicable rung as pass/fail/skipped with the command or artifact: types, tests, world/document, gameplay, screenshot, pixel metrics, and visual score. A completion claim without the acceptance evidence is not complete.

## Inside the engine monorepo

These guarded repository scripts exist only in the jgengine monorepo — never expect them in a created project:

- `bun run gate` is the full local verdict before shipping; `bun run ship:preflight` is the final check immediately before commit/push.
- Use guarded scripts (`bun run test`, `bun run test:all`, `bun run gate`), not an unbounded bare `bun test` across the repository.
- `bun run drive <game> --wait ... --rpc ... --key ...` scripts the browser drive headlessly; `drive --playtest` with a declared capture probe is the softlock/progress rung for interactive loops, and the perf sequence above becomes one command: `bun run drive <game> --wait <load+warmup> --rpc '{"method":"debug_perf_reset"}' --key KeyW:4000 --wait 10000 --rpc '{"method":"debug_snapshot"}'`. Drive's `--mode play` captures live integration; preview states capture deterministic HUD/menus.
- Per-shot player spawn: `bun run shoot <game> --spawn x,y,z` (or `drive --spawn`, or a `?spawn=x,y,z` URL overlay, mirroring `?cam=`) relocates the player for that capture only — the play camera follows, so a close-up frames the new vantage — **without editing `editor.scene.json`**. Accepts `x,y,z` or `x,y,z,yaw` (yaw radians); it overrides only the default `player_spawn` (an explicit marker id/kind is untouched). Prove non-mutation by checking the scene file's `git status` stays clean after the run. Use it instead of hand-editing and restoring the scene document.
- Editor/district aerials in one call: `camera_goto`/`camera_frame` take `distance`, `pitch` (degrees above the horizon; 90 = straight-down), `yaw`, and `height`, so `bun run drive <game> --mode editor --rpc '{"method":"camera_frame","pitch":70}' --shot aerial` frames the whole document from above with an auto-fit distance — no KeyF-buries-in-terrain and no guess-the-y-offset round-trips. Pin a spot + pose with `--rpc '{"method":"camera_goto","x":40,"z":-20,"distance":80,"pitch":55}'`. The RPC response echoes the resolved `target` (with `distance`/`pitch`) as the numeric proof the pose changed.
- Movement/held-input claims: `drive` focuses the game surface before every `--key` hold (play-mode keys are a React `onKeyDown` on the canvas wrapper, dead unless that element is `document.activeElement` — a prior `--click` moves focus off it) and holds the key across at least one rendered frame, so a held key advances the sim even on a slow software-GL page. Prove movement with `--probe`, which prints the game's live `capture.probe` metrics (declare one that returns player x/y/z): `bun run drive <game> --probe before --key KeyW:20000 --probe after` — a non-zero position delta between the two reads is the honest check. Judge movement by that RPC delta, **not** by screenshot diffs: headless GL here runs at a fraction of 1 fps, so a real held key moves the player only a little per second and before/after frames can look identical while the delta is clearly non-zero.
- Visual PRs embed final screenshots with `bun run pr-shots`; do not send binary images through GitHub content APIs. Any change to a map, world, or scene document counts as visual: attach captures of the changed content (in-game shots, or a map render derived from the authored document) to the PR and share them in the conversation, not just test assertions.
