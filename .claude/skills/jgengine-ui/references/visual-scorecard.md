# Visual scorecard

This repeatable 0–3 rubric makes "looks shipped" consistent across sessions and usable by a fresh-eyes reviewer. Apply it to milestone shots, not every tweak, and place the scored table beside PR screenshots.

Structure and thresholds adapted (concept only, reworded for this stack — not copied verbatim) from `majidmanzarpour/threejs-game-skills`' `visual-scorecard.md` (MIT); see `CREDITS.md`.

## The 0–3 scale

Score each category independently against what's actually in the shot, not what the code intends.

| Score | Meaning |
| --- | --- |
| **0** | Engine defaults or debug output. Untextured primitives, default grey material, flat ambient light, no sky/fog treatment, no authored placement. |
| **1** | Basic styled prototype. Readable and on-genre, but generic — solid-color materials, one light, sparse or untuned `AuthoredScene` content, no distinct silhouettes. |
| **2** | Premium stylized. Authored silhouettes on hero/obstacles, a coherent material system (not one grey PBR everywhere), tuned `environment()` lighting/sky/post, foliage and props placed through the editor read as a real place, not a demo. |
| **3** | Showcase art direction. Everything in 2, plus: no repeated silhouette anywhere in frame, deliberate foreground/midground/background composition, purposeful VFX and motion, a HUD that could not be mistaken for another game. Reads like a store page, not a build. |

## The 10 categories

Score all ten from one `--mode play` shot plus deterministic world/document evidence from `jgengine-verify`. Data presence is a prerequisite, not a substitute for visual judgment.

1. **Art direction** — one coherent palette and mood across ground, props, sky, and UI; not three unrelated hue choices stapled together.
2. **Hero/player** — an authored silhouette and material set the player is meant to be, not a default primitive or a capsule with an emissive glow standing in for a character.
3. **Obstacles/enemies** — distinct types read apart at a glance; not one mesh reused at different scales/colors.
4. **Rewards/interactables** — visually distinct from hazards and terrain at a glance, not the same proxy geometry as everything else.
5. **World/environment** — foreground, midground, and background read as separate layers (props/landmarks near camera, terrain shaping mid-distance, sky/fog treatment at the horizon); not one flat plane running to a bare horizon.
6. **Materials/textures** — terrain and props carry texture and color variation (`environment({ sculpt, materialRegions })`, catalog GLBs via `jgengine-assets`), not flat untextured solids.
7. **Lighting/render** — a tuned daylight/sun+hemisphere rig and post stack (per `look: "cinematic"`, #773), not the bare untouched three.js default light.
8. **VFX/motion** — particle/motion feedback tied to actual gameplay events (hits, pickups, weather), not absent, and not one looping default effect standing in everywhere.
9. **UI/HUD** — a game-specific `HudCanvas`/`HudPanel` composition; fails automatically if it could pass for a generic admin dashboard.
10. **Performance evidence** — the look holds at the scale the game actually runs (`InstancedScatter` density, many entities), not only a hand-posed hero shot with three objects in frame.

## Measured-evidence row

Pixel metrics from `bun run shoot <id> --mode play --inspect` (or `bun run inspect-shot.ts <shot.png>` on an existing PNG — [#788](https://github.com/Noisemaker111/jgengine/issues/788), shipped) are the objective inputs to categories 5–7 — they don't replace the eye, they catch what a rushed glance misses. Output lands at `shots/<name>.metrics.json`:

| Metric | Threshold | Flags |
| --- | --- | --- |
| `colorEntropyBits` | `< 3.0` | sparse palette |
| `dominantColorShare` | `> 0.6` | sparse / one material dominates the frame |
| `edgeDensity` | `< 0.04` | primitive-dominant, too few silhouettes |
| `luminance.contrast` | `< 60` | fog/post compressing out real geometry |

Any metric over threshold caps the affected category at **1** regardless of how the shot reads by eye — the number is a floor, not a veto the eye can talk it out of. `--strict` hard-fails on a crossed threshold for CI; the scorecard itself always records this row from the JSON, never "not measured."

## Pass thresholds

- **Premium**: every category ≥ 2, average ≥ 2.3.
- **Showcase**: at least 6 categories at 3, no category < 2, average ≥ 2.7.

Below "premium" on a claimed milestone is not shippable; keep working the art stack or narrow the claim.

## Automatic failures

Any one of these fails the shot regardless of the averaged score:

- **Primitive-dominant shots** — untextured boxes/spheres/cylinders make up the visible mass of the frame.
- **Default primitive + glow standing in for a hero** — an emissive-glow capsule/sphere is not a character, even at full brightness.
- **One repeated silhouette everywhere** — `InstancedScatter`'s stylized proxy species (or any single catalog model) used with no palette variety across the whole visible world.
- **Fog/bloom hiding missing geometry** — atmosphere used to obscure an empty or unfinished scene instead of to add depth to a populated one.
- **No active-play shot** — only editor/menu/poster shots submitted. `--mode play` (or `drive` past the menu) evidence is mandatory; a scene that only looks good in the editor camera hasn't proven anything about how the game actually reads.

## Fresh-eyes review and the lower-score rule

Hand a reviewer **only** the screenshots, this rubric, and the measured-evidence JSON — no PR description, no "here's what I was going for." A reviewer who knows the intent scores the intent; a fresh reviewer scores the pixels, which is the only thing a player ever sees.

- The author scores first (self-score).
- A fresh-eyes pass (a different session, or the same session after clearing framing context) scores independently.
- Where the two disagree, **the PR carries the lower score**, never the average and never the higher one. Optimistic self-scoring is the failure mode this guards against — take the lower number and keep working the art stack instead of arguing the rubric.

## Using this in a PR

Any PR that changes what a player sees pastes the ten-category table (score + one-line reason per category below 2), the measured-evidence row, and the reconciled score next to embedded screenshots. Report that verdict through `jgengine-verify`'s evidence format.
