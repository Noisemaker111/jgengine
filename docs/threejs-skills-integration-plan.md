# Three.js skill-repo integration plan

Assessment of two external MIT-licensed Claude skill repos and how their content maps onto JGengine's rendering surface. No code or issues have been filed from this document — it is the decision record for what to build, in what order, behind which seams.

Sources evaluated:

- **[majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills)** (MIT) — game-production workflow + asset-generation API wrappers.
- **[scottstts/Threejs-Awesome-Graphics-Agent-Skills](https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills)** (MIT) — 23 engine-agnostic rendering technique guides.

## Can we grab from them?

Yes. Both are MIT, so incorporating their techniques into the AGPL-3.0 `@jgengine/*` packages is clean. The only obligation is attribution, and this repo already has the exact machinery and precedent for it:

- **[`CREDITS.md`](../CREDITS.md)** — the `achrefelouafi` entry is precisely this shape: MIT three.js reference projects whose shader/math techniques were ported into `packages/shell` (water, rain, snow, buildings), credited per-feature with a source table.
- **On-screen + website credit** — the `credit` field in [`apps/web/src/content/games.ts`](../apps/web/src/content/games.ts) rendered by `Credit.tsx`, plus the game HUD.

Rule to honor (from `CLAUDE.md`): *credit borrowed work in the same PR that uses it.* Every primitive below ships its CREDITS.md row in the same PR.

Important distinction: we are porting **techniques**, not skill markdown. These repos' skills document algorithms; they back no JGengine code. A technique only becomes a JGengine skill *after* its primitive exists in `packages/shell` — because `check-types` validates that every `jgengine-*` skill matches a real API surface, and skill descriptions are hard-capped model-invocable one-liners, not technique essays.

## Repo 1 verdict: mostly skip

`majidmanzarpour/threejs-game-skills` is a game-**production workflow** system (design→build→ship phases) plus asset-generation API wrappers (Tripo 3D, Gemini images, ElevenLabs audio). JGengine already has a deeper, repo-native equivalent of the workflow half: the `jgengine` router, `fan-out`, `harvest-game`/`harvest-full-game`, and the domain skills.

- **Don't port** the orchestration skills, the asset-gen API wrappers, or the QA skill. The QA skill's canvas-pixel visual-regression (color entropy / edge density / luminance metrics) directly **conflicts** with `jgengine-verify`'s governing doctrine — "scene truth is data," headless WebGL is "the flakiest, slowest step in the repo." Adopting pixel-metric gating would fight the grain of the repo.
- **Possible salvage (low priority):** the `references/physics-engine-selection.md` decision matrix (custom vs Rapier vs cannon-es) and the game-feel checklist (hitstop, camera shake, easing) could fold as a paragraph into `jgengine-gameplay`. Marginal — JGengine already has a physics layer and a shake channel. Not worth a dedicated batch.

## Repo 2: the goldmine

`scottstts/Threejs-Awesome-Graphics-Agent-Skills` is a pure rendering-technique library, and its skills map almost 1:1 onto JGengine's real rendering gaps. Every candidate below is a known, engine-agnostic algorithm with explicit build-order and failure-mode docs — ideal reference specs to port behind JGengine's own seams.

Two hard constraints shape every port:

1. **Layering.** Only `packages/shell` renders (it owns `three`, `@react-three/fiber`, `@react-three/drei`, `three-stdlib`). Every primitive lands in `shell`; anything data-shaped (config descriptors, field definitions) can live in `core` and be meshed by `shell`, matching the existing terrain/weather/ocean split.
2. **Data-driven, not player-visible-by-default.** JGengine assembles scenes from `Playable` config. New rendering primitives must be **opt-in config** with defaults that leave every existing game pixel-identical — extracting/adding a primitive *must not change how a game plays or looks* unless a game opts in. Confirm before flipping any default that a player would see.

### Ranked candidates

Ranked by (gap severity × fit × isolation). Effort is frontier-design + worker-implement rounds.

---

#### 1. Postprocessing pipeline — **highest ROI**

- **Gap:** JGengine has *zero* postprocessing. No `EffectComposer`, no tone-mapping config, no bloom/AO/grading. The single `<Canvas>` ([`GamePlayerShell.tsx:1826`](../packages/shell/src/GamePlayerShell.tsx)) sets only `preserveDrawingBuffer` for screenshots.
- **Source skills:** `threejs-bloom` (HDR selective bloom, dual-pass material substitution), `threejs-exposure-color-grading` (HDR→meter→exposure→tonemap→grade/LUT→output; forbids double-sRGB / duplicate tonemap), `threejs-screen-space-ambient-occlusion` (GTAO), `threejs-image-pipeline` (pass-ordering coordinator sharing buffers).
- **Primitive shape:** a `PostProcessing` component in `shell` wrapping an `EffectComposer`, driven by a `PostFxConfig` on the playable (e.g. `{ toneMapping, exposure, bloom?, ao?, grade? }`). Ordering enforced by the image-pipeline doctrine. Default `undefined` → composer absent → current renderer path unchanged (games stay identical).
- **Dependency call:** `@react-three/postprocessing` + `postprocessing` is the idiomatic r3f route, but `CLAUDE.md` prizes *removing* dependencies. Decision to make at design time: adopt the library (fast, battle-tested, shell-only so it doesn't touch the zero-dep core) vs. hand-roll composer passes from the skill GLSL (matches the existing "custom shader per feature" style, no new dep, more code). **Recommendation:** adopt `@react-three/postprocessing` in shell only — it's a rendering-layer dependency in the one package already carrying three.js, and the skill docs then serve as tuning/ordering spec rather than reimplementation burden.
- **Skill surface:** new `jgengine-postfx` (or a section in `jgengine-ui`/a rendering skill) documenting the `PostFxConfig` surface. Terse description, real API backing.
- **Credit:** CREDITS.md row → scottstts bloom/exposure/AO/pipeline skills.
- **Risk:** low-medium. Isolated, opt-in, no core changes. Biggest visual payoff per line.

#### 2. Cascaded / clipmap shadows

- **Gap:** shadows are a single on/off boolean (`shadows={playable.shadows ?? true}`); no CSM, bias tuning, or per-light map resolution. Large open worlds get one low-quality shadow map.
- **Source skill:** `threejs-shadow-systems` (cached clipmap cascaded shadow maps: concentric texel-aligned levels, cross-fade blend, distance-tiered refresh budgets).
- **Primitive shape:** a `ShadowRig` in shell configuring cascaded shadow maps for the directional "sun" in `ConfiguredLighting` / `Daylight`. Config `ShadowQualityConfig` (cascades, resolution, distance, bias). Default → current single-map behavior.
- **Skill surface:** extend `jgengine-world` (lighting section) or the rendering skill.
- **Credit:** CREDITS.md → scottstts shadow-systems.
- **Risk:** medium. Interacts with the daylight/sun-light wiring; needs care that existing lit games don't shift.

#### 3. Pooled instanced particle / VFX system

- **Gap:** weather (rain, snow, fire, lightning) is bespoke GLSL per-feature ([`shell/weather/*`](../packages/shell/src/weather)). No reusable emitter — every new effect is hand-written shader quads.
- **Source skill:** `threejs-procedural-vfx` (graph-based particle pipeline: event states → instance attributes → mask/age → material → pooling → HDR emission; pooling over per-burst allocation).
- **Primitive shape:** a `ParticleSystem` primitive in shell (instanced, pooled, config-driven emitters) that the existing weather effects could later be refactored onto. This is a genuine *seam* per the design principles — turns "new effect = new engine file" into "new effect = data."
- **Skill surface:** new section in a rendering skill, or extend `jgengine-procedural`.
- **Credit:** CREDITS.md → scottstts procedural-vfx.
- **Risk:** medium. High architectural value (satisfies "extend through seams"), but refactoring existing weather onto it is player-visible — do the primitive first, migrate weather only with confirmation.

#### 4. Procedural PBR material graph

- **Gap:** materials are flat-color / vertex-color `MeshStandardMaterial`; no diffuse/normal/roughness/AO maps, no triplanar/splatting. `jgengine-assets` already *sources* Poly Haven / ambientCG PBR textures that nothing consumes.
- **Source skill:** `threejs-procedural-materials` (unified PBR channel graph from shared fields, triplanar seam handling, mip-aware microstructure).
- **Primitive shape:** a material-builder in shell producing textured/triplanar `MeshStandardMaterial`s from a channel-graph config, usable by terrain and structures. Complements the existing `materialOverride.ts` runtime patcher.
- **Skill surface:** extend `jgengine-assets` (it already owns material/texture conventions).
- **Credit:** CREDITS.md → scottstts procedural-materials.
- **Risk:** medium. Touches terrain/structure meshing; opt-in per material.

#### 5. Atmosphere & volumetric clouds

- **Gap:** sky is a hand-authored two-color gradient `ShaderMaterial` ([`environment/Daylight.tsx`](../packages/shell/src/environment/Daylight.tsx)); no scattering, no IBL, no clouds.
- **Source skills:** `threejs-atmosphere-aerial-perspective` (Bruneton-style scattering, altitude correction), `threejs-volumetric-clouds` (weather-shaped density raymarching, temporal reprojection, cloud shadows).
- **Primitive shape:** an `Atmosphere`/`Sky` primitive replacing or augmenting `SkyDome`, wired to the existing time-of-day curve (`environment/daylightCycle.ts`). Config-selected: keep gradient dome (default) or scattering/clouds.
- **Skill surface:** extend `jgengine-world` or `jgengine-procedural`.
- **Credit:** CREDITS.md → scottstts atmosphere + volumetric-clouds.
- **Risk:** medium-high. Volumetric clouds are expensive (raymarched) — must respect the "scale is a default" principle and stay off unless opted in.

#### 6. Spectral (FFT) ocean + water optics

- **Gap:** current ocean is Gerstner-sum with fresnel/foam, no reflection/refraction render targets ([`water/OceanShader.ts`](../packages/shell/src/water)).
- **Source skills:** `threejs-spectral-ocean` (Tessendorf FFT, multi-cascade bands, Jacobian foam — but written in WebGPU/TSL, needs WebGLRenderer translation), `threejs-water-optics` (Beer-Lambert absorption, screen-space refraction, caustics).
- **Primitive shape:** an upgrade path for the existing `Ocean` — either a higher-fidelity `OceanConfig` tier or a sibling FFT surface. Water-optics techniques (absorption, refraction) are the higher-fit, lower-cost half.
- **Skill surface:** the existing water docs.
- **Credit:** CREDITS.md → scottstts spectral-ocean + water-optics (note: the current ocean already credits achrefelouafi — this augments, doesn't replace, that lineage).
- **Risk:** medium-high. FFT ocean's WebGPU/TSL source needs porting to the WebGL path the shell uses; water-optics is the pragmatic first slice.

### Lower-priority / niche (note, don't schedule)

- `threejs-raymarched-space-effects` (black holes, RK4 geodesics), `threejs-procedural-planets` (spherical terrain) — spectacular but genre-specific; build only when a game needs them.
- `threejs-procedural-geometry` / `-architecture` / `-vegetation` — overlap heavily with JGengine's existing procedural terrain/building/grass systems; mine for specific improvements (e.g. the LOD-decision step, since JGengine uses no `THREE.LOD`) rather than porting wholesale.
- `threejs-temporal-surfaces` (ping-pong history buffers for frost/persistent screen effects) — reusable technique, but no current game needs it.
- `threejs-camera-direction` / `-procedural-animation` — JGengine's camera rigs and animation are already solid; skim for the frame-rate-independent spring-follow math only.

## Suggested sequencing

Each item is one ship motion (branch → build primitive in shell → skill doc → CREDITS row → PR). Confirm before any default flips a live game's look.

- **Batch 1 — Postprocessing (#1).** Highest ROI, most isolated, opt-in config, no core changes. Best first cut. Establishes the `EffectComposer` seam that AO/grading extend.
- **Batch 2 — Particle system (#3).** Pure additive seam; big architectural win; migrate existing weather onto it later, separately, with confirmation.
- **Batch 3 — Shadows (#2)** and **PBR materials (#4).** Quality upgrades to existing lit/textured surfaces; more care around not shifting current games.
- **Batch 4 — Atmosphere/clouds (#5)** and **water optics (#6).** Highest cost, most GPU budget; gate carefully behind config and the scale principle.

## Also worth a CLAUDE.md / skill pointer

Independent of building anything: add a one-line note (in the rendering skill or `jgengine-assets`) that `scottstts/Threejs-Awesome-Graphics-Agent-Skills` is a vetted external reference library to consult when implementing advanced rendering — so future sessions mine the algorithm docs instead of reinventing. Cheap, immediately useful, no code.

## What this plan deliberately does not do

- No pixel-metric visual regression (conflicts with `jgengine-verify`).
- No wholesale skill-markdown import (skills must back real shell API; `check-types` enforces it).
- No default that changes an existing game's appearance without confirmation.
- No new dependency in `core` or any non-`shell` package.
