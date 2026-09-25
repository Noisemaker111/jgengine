---
name: jgengine-verify
description: "Before claiming a change works, looks right, or ships, prove it: screenshots, gameplay, scene data."
---

# JGengine verification

Verification follows risk: cheapest deterministic evidence first, visual/browser evidence only for claims pixels or interaction uniquely prove. The default rungs below work in any JGengine project (a created standalone game included); engine-repository commands live in their own section at the end.

## Core ladder

1. Run the project's focused type/tests while iterating (`bun run check-types`, `bun test src`).
2. Assert pure rules and serialized transitions in tests.
3. Assert scene/environment data through `summarizeEnvironment`, voxel summaries, or authored-document queries.
4. Exercise gameplay progress when the loop can softlock.
5. Capture and inspect screenshots only for visual/layout/integration claims.
6. Record a short clip (`drive --record`, engine monorepo) when the claim is about behavior *over time* — collision, movement, camera feel, animation, a sequence of states — and a single frame cannot carry it.

A feature or change that alters runtime behavior is not done when its tests pass: **try it**. Drive the actual game (`drive` with keys/probes/record) and observe the new behavior happening before claiming completion — tests prove the rule, the drive proves the game.

## Choose evidence

Classify each acceptance claim before scheduling proof. A plan that uses screenshots where deterministic evidence suffices is incomplete.

| Claim | Primary proof | Screenshot policy |
| --- | --- | --- |
| rules, combat, progression, persistence | focused unit or gameplay tests | do not capture |
| authored or generated world content exists | scene queries, `summarizeEnvironment`, or serialized-document assertions | do not capture merely to prove existence |
| performance | `debug_snapshot` simulation and render metrics | do not photograph an fps counter |
| layout, lighting, framing, or visual fidelity | pixel metrics plus an inspected screenshot | capture only the states and viewports named by the claim |
| behavior over time: collision, movement, camera, animation, staged sequences | probe deltas plus a recorded clip (`drive --record`) | record the one sequence the claim names; inspect extracted frames like any shot |

## Scene and gameplay proof

- Generated worlds assert resolved counts, finite/non-flat terrain where expected, palettes, bounds, and required features.
- Authored worlds assert required layers, objects, paths, markers, and ids from `editor.scene.json`.
- Gameplay tests prove the observable acceptance scenario, including save/restore or multi-client behavior when changed.
- Time-based headless tests: `HeadlessRunner.step(dt)` clamps every step to `maxStepSeconds` (default 0.05 s) no matter what dt you pass — `step(5)` advances the sim by 0.05 s, not 5 s, so a timer that "never fires" is usually this clamp, not a bug. Advance game time with many small steps (~20 per second of game time, e.g. `for (…) runner.step(1 / 60)`), or raise `maxStepSeconds` in the runner options when coarse fixed steps are intended.
- `drive` boots from a **clean storage state by default**: it clears the target origin's `localStorage`/IndexedDB/origin storage before navigating, so a game with `persist: true` (whole-world save) starts fresh and `capture.probe` reflects THIS run rather than a restored prior session. On a warm/persistent Chrome (`shoot daemon`, `--keep`/`--connect`) that save would otherwise carry between drives and silently corrupt probe/recording evidence. Pass `--reuse-storage` to intentionally keep the warm profile's save (e.g. to capture a Continue/restore flow).
- For interactive softlock/progress proof, drive input and interrogate `window.__jgengineAgent.handle({ method: ... })` — `agent_status`, `debug_snapshot`, and the editor verbs work headlessly on any running game page. In a created standalone game the one command for all of this is `bun run drive` (`scripts/drive.mjs`, shipped in the scaffold): ordered `--click`/`--key`/`--wait`/`--shot` steps, `--rpc '{"method":"agent_status"}'` for the bridge, and `--playtest --strict` for the softlock rung — never hand-roll a Playwright/Puppeteer/CDP script or a bespoke Vite consumer for this. A browser tool on the `bun dev` page is the fallback, not the default.
- Placeholder-vs-authored: `debug_snapshot().probes.fallbacks` reports which render seams resolved to fallbacks (green ground, primitive actors, proxy scatter) and why — a non-empty count proves content is unauthored/misconfigured rather than an intended placeholder. `probes.textureErrors` (`{ url, count }[]`) is its twin for the failure `fallbacks` cannot see: a model that resolves but whose GLB textures 404 — a non-empty list is a visibly-broken (untextured) scene, treat it exactly like a model fallback.
- UI-flow logic (a command/intent handler, not its pixels): drive it canvas-free with `createHeadlessRunner(...).ui.invoke("intent.name", input)`, then assert the resulting reactive state off `ctx` (store, stats, scene). No renderer, no pointer simulation — leave pixels to `shoot`; prove the logic headlessly.


## Performance proof

When a game is reported slow, play it and pull the debug menu's perf data instead of guessing:

Use these budgets when reviewing frame metrics:

| Profile | Frame budget | Draw-call budget | Triangle budget |
| --- | ---: | ---: | ---: |
| flat | 16.6 ms | 300 | 500,000 |
| cinematic | 16.6 ms | 600 | 1,500,000 |

PRs that add authored world content must include a before/after `debug_snapshot` pair. Capture both snapshots on the same hot path and compare `frame.avgFrameMs` with `render.drawCalls` and `render.triangles` against the applicable budget above.

1. Run the game (`bun dev`), warm it up, call `debug_perf_reset` through the agent bridge (or F2+D's Perf panel), play the hot path, then take a `debug_snapshot` — reset drops load/shader-compile stalls from the frame window; the snapshot's `why` line names the culprit.
2. Read `frame.avgSimMs` vs `frame.avgOutsideMs`: sim-heavy means game logic (wrap hot `onTick` work in `measure("name", fn)` and re-snapshot; phases rank themselves); outside-heavy means render/GPU — check `render.drawCalls`/`render.triangles` and the long-frame log.
3. Fix at the owning seam, then re-run the same sequence and report before/after `avgFrameMs` + `render` counts as the evidence pair. Draw/triangle counts are deterministic and survive slow CI hardware; raw fps there is not the player's fps.
4. In-browser, F2+D opens the same data as the Perf panel; `debug_report` returns the unabridged snapshot.

## Visual proof

A PR that touches a rendered surface embeds the inspected shots. The ten-category table in [references/visual-scorecard.md](references/visual-scorecard.md) is for milestone claims about a game's overall look ("premium", "showcase", a whole-game pass), not for every rendered change.

**Created standalone game:** `bun run shoot` (or `npx jgengine shoot`, which also works in an older scaffold without `scripts/`) starts the dev server if needed, forces a real viewport, waits for an honest frame, and writes `shots/shot.png` headless. Flags: `--device desktop|mobile|mobile-landscape`, `--url`, `--out`, `--settle`, `--timeout`; `--help` for all. Set `CHROME_PATH` if Chrome is not auto-detected. For shots that need play first (menus clicked through, keys held, RPC state set up), use `bun run drive` (or `npx jgengine drive`) with `--shot` steps instead of scripting a browser by hand.

**Inside the engine monorepo:** use one managed capture session (`bun run shoot daemon start`, then `bun run shoot <game> --mode play --size half --inspect`, then `bun run shoot daemon stop`). Aiming (`--look`, `--spawn`, `--view`), preview fixtures (`--fixture`), recording, `pr-shots`/`pr-video`, regression bisect (`bun run probe`), and capture-stack behavior are in [references/monorepo-capture.md](references/monorepo-capture.md). If managed capture fails twice, stop retrying and report lower-rung deterministic evidence.

**Arbitrary URLs (`shoot --url`):** the page must set `document.documentElement.dataset.jgCapture = "ready"` (HTML `data-jg-capture="ready"`) when the frame is honest; set `data-jg-capture="error"` with `data-jg-capture-error` on failure. Prefer managed game or `--site` targets over a hand-rolled Vite consumer.

A shot on disk is self-describing: a failed run leaves no file at its path, a re-capture that matches the shot it replaced prints `SAME PICTURE as the shot it replaced` (a no-op change or the wrong view, not a pass), and a blank viewport fails the command. None of that replaces looking.

Screenshots come from the game's own dev server. Read every screenshot adversarially: assume it is broken and hunt for the flaw. A shot is evidence to be prosecuted, not a formality to wave through. Comb the frame region by region at full size — corners, edges, and background included — never sign off on a glance. Optimism here is a defect: "looks good" on a broken frame is worse than no capture, because it launders a bug into a completion claim.

- Judge against the brief, not against "a working build". When the task names a target — a reference game, a mockup, a design doc, "make it look like X" — that target is the bar. Put the reference beside the shot and compare feature by feature: terrain treatment, unit and building silhouettes, HUD layout and console, resource/economy model, palette, camera angle. A slice that runs but resembles the target in nothing is a **fail**, not a pass. "It is only a vertical slice" narrows the *scope* of what is claimed; it never lowers the bar for what is actually in frame. If the shot shares almost nothing with the named target, say so plainly and score it a fail — do not credit it for booting.
- Enumerate defects before you judge. Walk the frame and name what is actually wrong: clipping and z-fighting, stretched/low-res/placeholder textures, misaligned, overlapping, or clipped UI, cut-off or overflowing text, wrong anchors and off-screen elements, seams and gaps, flat/black/blank regions (an unrendered corner or blown-out sky is a render bug, not lighting), missing shadows or lighting, jagged or aliased edges, colour banding, default/untextured primitives, repeated identical silhouettes. Only after that itemized pass may you state a verdict, and the verdict must name what you checked.
- One visible bug is a fail. If any defect is present in the shot, the claim is not proven — report the defect and its pixel location, do not average it away, talk yourself out of it, or call the overall look acceptable "apart from" it. Fix it or narrow the claim and re-capture.
- Never write "all good", "looks good", "ships", or an equivalent sign-off without an accompanying list of what you inspected and what, if anything, you found. A bare approval with no itemized pass is not a review.
- Use deterministic preview states for HUD/menu captures; use live play for integration and scene look.
- Menu-gated games declare `capture.play`/`capture.states` (see `GameCaptureConfig`) rather than hand-driving setup repeatedly. `capture.play` dispatches once at context-ready; if a play-mode shot fails with "a start menu still on screen" while `play` *is* declared, an async boot step (whole-world save restore, hydration) is resetting the start gate after those commands ran — fix the game so the restore preserves an already-live session, not the capture command. (A transient post-HMR stale page is not this: `shoot` already auto-reloads once for it, so a menu-on-screen failure that *survives* that reload is a real game boot bug.)
- Inspect desktop and mobile when responsive UI changes.
- Run pixel inspection for blank/sparse/contrast regressions, then open the PNG and judge it against the UI scorecard.
- If a WebGL capture hangs once, do not repeat the same foreground command; fall back to deterministic scene evidence and report the capture failure.

## Behavior clips

Behavior over time gets a clip, and every behavior change gets *tried*: tests prove the rule, driving the actual game proves the game. When the claim is about motion (collision, movement, camera, animation, a staged sequence), record it with `bun run drive <game> --record <name>` and pair it with `--probe` deltas. Judge movement by the probe's position delta, not by screenshot diffs: headless software GL moves the player only a little per second. Present clips as MP4 video or still frames, never a GIF, and never send a video file into the conversation; share stills plus the GitHub link. Upload paths (`pr-video`, the `/pr-video` workflow comment) are in [references/monorepo-capture.md](references/monorepo-capture.md#pr-media).

## Evidence report

Report each applicable rung as pass/fail with the command or artifact, one line each; leave out rungs that do not apply. A completion claim without the acceptance evidence is not complete.

## Inside the engine monorepo

These guarded repository scripts exist only in the jgengine monorepo — never expect them in a created project:

- PR CI runs the full `bun run gate` set; run it locally only when changing the gate or reproducing a CI failure. `bun run ship:preflight` runs after commit, before push.
- Use guarded scripts (`bun run test`, `bun run test:all`, `bun run gate`), not an unbounded bare `bun test` across the repository.
- Any change to a map, world, or scene document counts as visual: attach captures of the changed content to the PR, not just test assertions.
- Everything else (`drive --playtest` on software GL, fixtures, aiming, recording, PR media) is in [references/monorepo-capture.md](references/monorepo-capture.md).
