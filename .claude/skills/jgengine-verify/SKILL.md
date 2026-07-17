---
name: jgengine-verify
description: Prove a change works, looks right, or ships with proportional evidence: screenshots, gameplay, scene data.
---

# JGengine verification

Verification follows risk: cheapest deterministic evidence first, visual/browser evidence only for claims pixels or interaction uniquely prove.

## Core ladder

1. Run focused type/tests while iterating.
2. Assert pure rules and serialized transitions in tests.
3. Assert scene/environment data through `summarizeEnvironment`, voxel summaries, or authored-document queries.
4. Exercise gameplay progress when the loop can softlock.
5. Capture and inspect screenshots only for visual/layout/integration claims.
6. Run `bun run gate` before shipping; run `bun run ship:preflight` immediately before commit/push.

Use guarded repository scripts (`bun run test`, `bun run test:all`, `bun run gate`), not an unbounded bare `bun test` across the repository.

## Scene and gameplay proof

- Generated worlds assert resolved counts, finite/non-flat terrain where expected, palettes, bounds, and required features.
- Authored worlds assert required layers, objects, paths, markers, and ids from `editor.scene.json`.
- Gameplay tests prove the observable acceptance scenario, including save/restore or multi-client behavior when changed.
- `drive --playtest` with a declared capture probe is the softlock/progress rung for interactive loops.

## Performance proof

When a game is reported slow, play it and pull the debug menu's perf data instead of guessing:

1. `bun run drive <game> --wait <load+warmup> --rpc '{"method":"debug_perf_reset"}' --key KeyW:4000 --wait 10000 --rpc '{"method":"debug_snapshot"}'` — reset drops load/shader-compile stalls from the frame window; the snapshot's `why` line names the culprit.
2. Read `frame.avgSimMs` vs `frame.avgOutsideMs`: sim-heavy means game logic (wrap hot `onTick` work in `measure("name", fn)` and re-snapshot; phases rank themselves); outside-heavy means render/GPU — check `render.drawCalls`/`render.triangles` and the long-frame log.
3. Fix at the owning seam, then re-run the same drive and report before/after `avgFrameMs` + `render` counts as the evidence pair. Draw/triangle counts are deterministic and survive slow CI hardware; raw fps there is not the player's fps.
4. In-browser, F2+D opens the same data as the Perf panel; `debug_report` returns the unabridged snapshot.

## Visual proof

Read every screenshot adversarially: assume it is broken and hunt for the flaw. A shot is evidence to be prosecuted, not a formality to wave through. Comb the frame region by region at full size — corners, edges, and background included — never sign off on a glance. Optimism here is a defect: "looks good" on a broken frame is worse than no capture, because it launders a bug into a completion claim.

- Judge against the brief, not against "a working build". When the task names a target — a reference game, a mockup, a design doc, "make it look like X" — that target is the bar. Put the reference beside the shot and compare feature by feature: terrain treatment, unit and building silhouettes, HUD layout and console, resource/economy model, palette, camera angle. A slice that runs but resembles the target in nothing is a **fail**, not a pass. "It is only a vertical slice" narrows the *scope* of what is claimed; it never lowers the bar for what is actually in frame. If the shot shares almost nothing with the named target, say so plainly and score it a fail — do not credit it for booting.
- Enumerate defects before you judge. Walk the frame and name what is actually wrong: clipping and z-fighting, stretched/low-res/placeholder textures, misaligned, overlapping, or clipped UI, cut-off or overflowing text, wrong anchors and off-screen elements, seams and gaps, flat/black/blank regions (an unrendered corner or blown-out sky is a render bug, not lighting), missing shadows or lighting, jagged or aliased edges, colour banding, default/untextured primitives, repeated identical silhouettes. Only after that itemized pass may you state a verdict, and the verdict must name what you checked.
- One visible bug is a fail. If any defect is present in the shot, the claim is not proven — report the defect and its pixel location, do not average it away, talk yourself out of it, or call the overall look acceptable "apart from" it. Fix it or narrow the claim and re-capture.
- Never write "all good", "looks good", "ships", or an equivalent sign-off without an accompanying list of what you inspected and what, if anything, you found. A bare approval with no itemized pass is not a review.
- Use preview states for deterministic HUD/menu captures; use `--mode play` for live integration and scene look.
- Menu-gated games declare capture commands/states rather than hand-driving setup repeatedly.
- Inspect desktop and mobile when responsive UI changes.
- Run pixel inspection for blank/sparse/contrast regressions, then open the PNG and judge it against the UI scorecard.
- If a WebGL capture hangs once, do not repeat the same foreground command; fall back to deterministic scene evidence and report the capture failure.
- Visual PRs embed final screenshots with `bun run pr-shots`; do not send binary images through GitHub content APIs.

## Evidence report

Report each applicable rung as pass/fail/skipped with the command or artifact: types, tests, world/document, gameplay, screenshot, pixel metrics, and visual score. A completion claim without the acceptance evidence is not complete.
