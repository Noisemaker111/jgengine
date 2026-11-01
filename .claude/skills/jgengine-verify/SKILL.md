---
name: jgengine-verify
description: "Before claiming a change works, looks right, or ships, prove it: screenshots, gameplay, scene data."
---

# Prove a change

Cheapest deterministic evidence first; pixels only for claims pixels alone can prove. Tests prove the rule, driving the real game proves the game: a change that alters runtime behavior is not done until you have watched it happen.

## Ladder

1. Focused type-check and tests while iterating (`bun run check-types`, `bun test src`).
2. Pure rules and serialized transitions in tests.
3. Scene data through `summarizeEnvironment`, voxel summaries or authored-document queries.
4. Gameplay progress when the loop can softlock: headless run, `drive` probes, a flow or a play script.
5. Screenshots for visual, layout and integration claims.
6. A clip (`drive --record`) when the claim is behavior over time.

## Choose evidence

Classify each claim before capturing anything. A screenshot where a deterministic check suffices is a plan defect.

| Claim | Primary proof | Screenshot policy |
| --- | --- | --- |
| rules, combat, progression, persistence | focused unit or gameplay tests | do not capture |
| authored or generated world content exists | scene queries, `summarizeEnvironment`, serialized-document assertions | do not capture to prove existence |
| performance | `debug_snapshot` metrics ([perf harness](references/perf-harness.md)) | do not photograph an fps counter |
| layout, lighting, framing, fidelity | pixel metrics plus an inspected screenshot | only the states and viewports the claim names |
| behavior over time | probe deltas plus a recorded clip | the one sequence the claim names |
| UI logic, not pixels | `createHeadlessRunner(...).ui.invoke("intent", input)`, assert state off `ctx` | do not capture |
| reaching a wave, boss phase or lap | `bun run simulate <game> <script>` | do not capture |

## Drive the game

- `bun run drive <game> --flow <name>` runs a route from `<game>/proofs/flows/<name>.flow.ts` (`defineFlow` from `@jgengine/core/play/flow`). A flow must check arrival (`expect`, `waitFor`, `hold(..., { until })`); a flow that only presses keys proves nothing. `--flows` lists them, `--step 'f.click("Start")'` tries one call on a warm page.
- One-off: `bun run drive <game> --click "TEXT" --key KeyW:2500 --probe --shot name`. `--rpc '{"method":"debug_summary"}'` reads fps, frame ms, draw calls and warnings; `player_pose` before and after a key hold proves movement; `sim_advance` and `time_scale` reach timers headless.
- `drive` starts from clean storage; `--reuse-storage` keeps a save, for a Continue flow.
- `debug_snapshot().probes.fallbacks` and `probes.textureErrors` prove content is authored, not a placeholder or a model with 404 textures.
- A shooter proof asserts the aim arrived (`aimAt`) before it asserts the hit.
- Never hand-roll a Playwright, CDP or Vite harness; a browser tool on `bun dev` is the fallback.

Steps, headless runners, flows, `simulate`, `shoot` modes and load guards: [references/drive-reference.md](references/drive-reference.md).

## Screenshots

A PR that touches a rendered surface embeds the inspected shots. Any change to a map, world or scene document counts as rendered.

- Standalone game: `bun run shoot` (`--device desktop|mobile|mobile-landscape`). Shots needing play first use `drive --shot`.
- Engine monorepo: `bun run shoot <game> --mode play --quality draft --inspect` while iterating, a final `--quality full` shot as evidence. Draft and `--quick` shots are never PR evidence. The game canvas keeps no copy of its last frame: in-game captures go through `requestSceneCapture`/`requestSceneThumbnail`, which read the next frame as it renders, never `toDataURL` from outside a frame. After two capture failures, stop and report lower-rung evidence. Aiming, fixtures, recording and PR media: [references/monorepo-capture.md](references/monorepo-capture.md).
- Whole-game look claims ("premium", "showcase") use the ten-category [visual scorecard](references/visual-scorecard.md); an ordinary rendered change does not.
- Use deterministic preview states for HUD and menu shots, live play for scene look. Check desktop and mobile when responsive UI changes.
- A shot on disk is self-describing: a failed run leaves no file, `SAME PICTURE as the shot it replaced` is a no-op or the wrong view, and a blank viewport fails.

### Reading a shot

Assume it is broken and hunt for the flaw; "looks good" on a broken frame launders a bug into a completion claim.

- Judge against the brief. When the task names a target (a reference game, mockup, "make it look like X"), put it beside the shot and compare silhouettes, HUD, palette and camera. A slice that resembles it in nothing is a fail; "only a vertical slice" narrows scope, never the bar.
- Enumerate defects before judging, region by region at full size: clipping, z-fighting, placeholder or stretched textures, misaligned or clipped UI, cut-off text, off-screen anchors, seams, flat or black regions, missing shadows, aliasing, banding, untextured primitives, repeated silhouettes.
- One visible bug is a fail. Report it with its pixel location, then fix it or narrow the claim and re-capture.
- No sign-off without the list of what you inspected and what you found.

## Behavior clips

For motion (collision, movement, camera, animation, staged sequences) record `bun run drive <game> --record <name>` and pair it with `--probe` deltas; judge movement by probe position delta, not screenshot diffs. Present clips as MP4 or still frames, never a GIF, and never send a video into the conversation: share stills plus the link. Uploads: [references/monorepo-capture.md](references/monorepo-capture.md#pr-media).

## Evidence report

One line per applicable rung: pass or fail, with the command or artifact. A completion claim without its acceptance evidence is not complete.
