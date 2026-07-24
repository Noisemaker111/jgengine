# jgengine SDK remediation — implementation brief

Audit of the full SDK (5 parallel deep audits, 2026-07-24). All file:line refs verified
against `main`. Findings are grouped by root cause and ordered by leverage.

**The one-line diagnosis:** jgengine is a mostly AAA-capable SDK that has been made
unfindable, sitting on a primitive layer with no composition tier. 86% of the public API
is imported by zero games. The engine is bigger than anyone using it knows.

Do the phases in order. Phase 0 is cheap and unblocks everything; the graphics work in
Phase 3 is where the actual visual ceiling is, but it is NOT what is slowing delivery.

---

## PHASE 0 — The docs are actively causing the problem (do first, ~1 day)

### 0.1 `recipes/minimal-game.md:76` instructs the opposite of CLAUDE.md
The whole-game recipe says: *"do not ship stock drop-in widgets (StatBar, Hotbar, Coins,
glass frames) as the product face. Reach for engine pieces only as headless data, layout,
or interaction models under game-owned chrome."*

CLAUDE.md says the opposite: building blocks "ship as drop-in-ready… Reaching for those is
using the engine correctly, not 'incomplete work'." `jgengine/SKILL.md` agrees with
CLAUDE.md ("reach for InventoryGrid, CharacterSheet the moment you're tempted to hand-roll").

This is the direct cause of 0/11 widget adoption. The components ARE correctly indexed in
`jgengine-ui/capabilities.md` — this is not a tagging gap, it is an instruction conflict,
and the recipe wins because it is the whole-game path.

**Fix:** rewrite that paragraph. Correct guidance is: compose the shipped blocks, then
reskin via HudTheme tokens. "Game owns its UI" means layout/terminology/art direction, NOT
re-implementing inventory grids and modals. Audit every `recipes/*.md` for the same
inversion.

### 0.2 Two competing "start here" entrypoints, both with zero adopters
- `packages/shell/src/gameKit.ts` — *"The happy-path game kit… Start here."*
- `packages/core/src/authoring.ts` — *"Game code should begin here."*

Adoption: **0/11 games each.** gameKit landed 2026-07-18; nine games were edited after and
none migrated. The scaffold emits gameKit, so the documented happy path is exercised only
by empty scaffolds, never by a game large enough to stress it.

**Fix:** pick one, delete/deprecate the other, migrate two real games onto the survivor.

### 0.3 The skill docs are a search index over an unnavigable surface
13,748 lines of generated api.md/capabilities.md (`jgengine-world/api.md` = 3,475,
`jgengine-ui` = 2,791, `jgengine-gameplay` = 2,134). This is a symptom of 1.1, not a fix.
Revisit sizes after export curation lands.

---

## PHASE 1 — Discoverability (this is the real bottleneck)

### 1.1 Kill the `"./*"` wildcard export
`scripts/export-manifest.json`: **997 public subpaths** (core 511, shell 197, editor 105,
react 79). Every package declares a blanket `"./*"` — every built dist file is public API.
**854 of 997 (86%) are imported by zero games.** Core: 118/511 used.

Consequence beyond noise: nothing was ever forced through a review boundary, which is why
issue #1320's findings went unnoticed — four verbs on one type
(`createStatPool`/`patchStatPool`/`changeStatPool`/`applyStatPoolDelta`), three incompatible
ownership models for "add an amount to an id", and **five** result-discriminant conventions
(`status`/`kind`/`outcome`/bare `| null`/suffix soup).

**Fix:** curate ~40 named subpaths per package. Wildcard becomes the escape hatch, not the
surface. Reconcile #1320's naming/result conventions in the same pass.

### 1.2 Add an adoption ratchet to CI
`Games/*` exist to find engine gaps. They currently find gaps that were already filled.
A `check-game-shape`-style rule should fail when a game-local module shadows an annotated
`@capability`, plus lint for: hand-rolled `absolute inset-0` overlays, local
`Window`/`Bar`/`Chip`/`Slot` components, hand-typed control legends where keybind-derived
`ControlsList` exists, and module-level `export let` state where `perContext` exists.

This one check catches every finding in Phase 2 mechanically, at review time.

---

## PHASE 2 — The re-derivation backlog (evidence the ratchet is needed)

### 2.1 UI: 11 of 13 duplicated patterns already ship
`packages/react` = ~17.3k lines / ~60 modules; **~30 have zero importers**.
`registry/jgengine` = 84 components, **one consumer**. The entire barrel surface actually
used across 10 games is seven identifiers: `HudCanvas, HudPanel, useHudLayout,
SettingsTrigger, KeyHint, ControlsList, StartScreen`. Game-local `game/ui/**` = **7,058 lines**.

| Pattern | Copies | Shipped equivalent (unused) |
|---|---|---|
| Action/build/hotbar slot (cooldown sweep, GCD dim, keybind badge) | 5 | `react/actionHud.tsx` (605 L), `registry/ability-action-bar` |
| End / death / win / lose screen | 7 | `components.tsx:464 DeathScreen`, `registry/results-screen` |
| Vendor / shop buy-list | 4 | `react/shopGrid.tsx` (298 L), `registry/vendor-panel` |
| Modal / window shell | 4 | `react/panels.tsx` (`Window`!), `react/modals.tsx` |
| Progress bars | 5 | `react/bars.tsx` (`barTokens` + atomic bars) |
| Currency / stat chip | 5 | `components.tsx:53 CurrencyPill`, `:82 StatMeter` |
| Toast / event feed | 4 | `components.tsx ToastStack` |
| Quest tracker | 3 | `react/questTracker.tsx` (123 L) |
| Talent tree + class select | 2 | `react/talentTree.tsx` (412 L), `characterSheet.tsx` (382 L) |
| Title / start screen | 2 | `react/startScreen.tsx` (159 L) |

Claudecraft names its local component `Window` — the same name the package exports.

**Control group:** `Games/tower-guard` is the ONLY registry consumer (9 import sites) and has
the smallest UI surface of any combat game (475 tsx lines). Its win+defeat screens are
**32 lines total** vs wreckway's 105 for the same two. Where discovery worked, duplication is
zero: all 4 minimaps use `react/map`; all 3 wave games use `core/ai/spawnDirector`; both
dialogue games use `DialogueBox`. Same engineers, opposite outcome.

**Only 2 genuine gaps:** a time-control/speed-button widget (loopline + starhome) and a
`lootToastRenderer` render prop (3 games re-write it identically).

**Also unused and product-relevant:** `PauseMenu` (no game has a pause overlay),
`ProximityPrompt`, `floatingText`, `inventoryGrid`, `keybindingMenu`, `saveSlots`, `killFeed`.

### 2.2 Gameplay: `handroll/` directories
Two games have a literal `src/game/handroll/` (~1,977 lines combined).
- `the-robots/src/game/handroll/` (710 L): `magazines`, `ffyl` (downed), `shields`, `guns`,
  `roll`, `elements`. Engine ships `core/combat/{magazine,downed,regenShield,weaponFire,
  projectiles}.ts` — all `@capability`-annotated, **all with zero imports across every game.**
- `vice-isle/src/game/handroll/driving.ts` (496 L) + `pursuit.ts` (264 L). `wreckway` has an
  independent SECOND driving stack (`game/vehicle/{input,controller}.ts`). Two games needing
  vehicle glue clears CLAUDE.md's own extraction bar — **lift a driving seam.**
- `claudecraft` re-derives ~2,000 lines over ~2,900 lines of shipped combat core (auras/status
  stacking, cast-bar-with-move-interrupt, damage resolution, resource regen). Note
  `core/combat/castRunner.ts:55` already models `"moved"|"cancelled"|"replaced"`. This game
  correctly uses `abilityKit`, `threat`, `pursuit`, `interestScheduler` — and still missed six
  modules in the same directory.

### 2.3 Cheap mechanical wins
- **Export `grounded(ctx,x,z)`** → fixes ~20 duplicated call sites. Engine already does this at
  `core/scene/behaviorRuntime.ts:170,179` and just doesn't export it. Cheapest item here.
- **Module-global state:** 22 sites across 7 games use `export let` where `perContext`/
  `defineStore` exist. `vice-isle/src/loop.ts:48-52` does it three lines below a correct
  `defineStore` call in the same file. Process-global = broken for server host / tests /
  split-screen. Violates scale-by-default.
- **Determinism leaks in games:** 24 raw `Math.random()` (loopline `sim/guests.ts` ×15,
  claudecraft ×9) plus 2 hand-rolled integer-hash PRNGs in starhome.
- **Default `SettingsTrigger` skin** — same 8×8 button className re-authored in 7 games.
- `mountGame(game,{gameId})` — `main.tsx` is 11 identical lines × 11 games, differing by one
  string literal, and `check-game-shape.ts:106` mandates the file.
- `PreviewFrame` (4 copies), `expectPopulatedEnvironment` (5 copies), default WASD codes map
  (4 copies — `shellMovement.ts:2` names the actions but ships no codes).

---

## PHASE 3 — Architectural blockers (real AAA ceiling; schedule deliberately)

### 3a. Cheap, high visual return — do these now
1. **CSM (cascaded shadow maps).** `render/SceneLighting.tsx:9-28` hardcodes ONE 1024px ortho
   frustum; outdoor scenes past `shadowCameraSize ?? 40` have no shadows. Zero hits for
   `CSM`/`CascadedShadow`.
2. **SMAA pass.** Current AA is `samples: 2` MSAA (`postfx/PostProcessing.tsx:110-113`). Zero
   hits for SMAA/FXAA/TAA. Every alpha-tested surface (grass, foliage, rain, particles) crawls
   — the loudest "not AAA" tell.
3. **HDRI environment.** Only IBL is three's stock `RoomEnvironment` PMREM'd at intensity 0.28
   (`render/EnvironmentLighting.tsx:18-25`) — metals reflect a gray studio box regardless of
   the authored world, and the daylight cycle never regenerates it. Zero `RGBELoader`/
   `LightProbe`/`lightMap`/`CubeCamera`.
4. **Seeded RNG on `GameContext`.** 15-17 core modules default to `Math.random` (`ai/mobBrain`,
   `combat/statusApplication`, `scene/autoTarget`, `game/lootTable`, `stats/rollCheck`) while
   `random/rng.ts:46` documents "never Math.random in a simulation." Blocks replay, lockstep,
   rollback. Fix before more modules copy the pattern.
5. **`ai/flock.ts:131` module-global grid** — `const gridCells = new Map()` at module scope;
   two worlds in one process share it. Straight bug.

### 3b. Open the closed seams (highest leverage on "make it look/feel AAA")
6. **Material/shader seam.** 115 inline material constructions across 41 files with copy-pasted
   `onBeforeCompile` string surgery; FBM/Worley GLSL duplicated between `terrainDetailMaterial`
   and `soilPatchMaterial`. The one public door is type-gated shut —
   `materialOverride.ts:42: if (!(material instanceof THREE.MeshStandardMaterial)) return material;`
   **A game cannot hand shell a ShaderMaterial.** Art direction lives in shaders, so every
   visual idea becomes a PR against `shell`. Need a material factory/registry + shader-chunk
   injection. Also missing: metalness map role (scalar only), KTX2.
7. **Composable post graph.** `postfx/PostProcessing.tsx:107-169` is a hardcoded if-ladder over
   a closed union in `core/render/postProcessing.ts`. Outline pass / custom LUT / SSR = fork the
   file. Also: `quality !== "high"` silently drops AO *and* DOF rather than degrading them.
8. **Open `ctx` to games.** `GameFeatures` is **13 hardcoded booleans**, and
   `SystemDefinition.feature` is typed `keyof GameFeatures`. To get `ctx.game.vehicles` you edit
   three files inside core. No module augmentation, no `TExtensions`, no token registry. A
   system's only public surface is `ctx.game.store: ObservableKeyedStore<unknown>` — hence
   `store.get(key) as T` everywhere. `BehaviorDescriptor` is likewise a closed 4-member union.
9. **Ship a composition tier.** No "assemble a character / encounter / level" seam exists — only
   6 recipe snippets. Also: stringly-typed command dispatch is hand-rolled in 5 games (1,557
   lines of switch statements over ~60 string names). The 12 open per-game `[BUG]` issues are
   exactly the class of hole this prevents.

### 3c. Scene format — currently a designer annotation layer, not a scene graph
10. **`EditorMarker` has no `scale` and only `rotationY`** (`core/editor/types.ts:16-41`). You
    cannot place a tilted rock or a scaled boulder. Baked through document → gizmo
    (`SelectionGizmo.tsx:484-487`) → runtime (`world/authoredObjects.ts:144`).
11. **Prefabs are copy-paste stamps.** `insertPrefab` deep-copies and tags `meta.prefabId`;
    there is NO `updatePrefab` anywhere — editing a prefab never updates instances. Result:
    `the-robots/editor.scene.json` = **430 flat markers, 0 prefabs, 0 collections, 0 catalogs**.
    vice-isle's *city* is 47 markers + TypeScript that generates the buildings.
12. **No placeable lights, no per-object materials, no audio emitters** in the document. Only a
    single global environment block (sky preset, fog, sun/ambient intensity). Interiors and
    night scenes are unauthorable.
13. **Authored logic is one action per volume** — `{enter|exit|interact} + one action id`. No
    conditions, variables, sequencing, or once-only. Used **once in the entire repo**
    (`studio-showcase`), and no game exports `triggerActions`.
14. **Editor gaps:** no vertex/surface snapping (numeric grid only), no align/distribute, no
    prefab edit mode, no autosave (`StatusBar.tsx:77` renders "Draft autosave / on" — it is a
    hardcoded literal and no draft persistence exists), no versioning, whole-document snapshot
    per undo step (terrain was optimized to deltas; object edits were not). Save is
    last-write-wins `writeFileSync` through a dev-only Vite plugin.

### 3d. Asset pipeline — zero offline processing
15. 998 GLBs / 208 MB committed to git and served **verbatim**. No KTX2/Basis, no Draco, no
    meshopt *encoding* (the decoder is wired at `shell/render/modelLoad.ts:178` and nothing ever
    encodes), no LOD generation, no atlasing, no lightmap baking.
    **`assets/src/cli/pull.ts:252` has no transform hook** — add one first; nothing else can
    exist without it.
16. Manifest carries no size, triangle count, texture res, or per-entry license
    (`assets/src/manifest.ts:53-68`). Nothing can enforce or report a budget. The whole index is
    a static JS barrel, so every app bundles metadata for all 998 assets.
17. **Collision meshes are an allowlist of THREE assets** (`collisionMeshAssets.ts:2-6`) because
    triangles go into the JS-imported index. Everything else gets an AABB. Non-convex props
    (arches, stairs, ramps, fences) cannot have real collision until collision data moves to
    fetchable sidecars.
18. **Streaming is unreachable by construction.** A full `WorldManifest` + proximity streamer
    exists in `core/editor/{world,streamer}.ts` with **zero consumers**, and every game does
    `import sceneJson from "./editor.scene.json"` — the entire scene ships inside the JS bundle.
    `runtime/visibility.ts:130-200` computes `{render, load, unload}` and **nothing consumes
    `unload`**; culling only flips `.visible`. No LRU, no refcount, no byte budget.

### 3e. Runtime — expensive, calcifies if deferred
19. **Games cannot extend the sim loop.** A genuinely good scheduler exists
    (`game/systemSchedule.ts`, topological before/after, order independent of imports) but
    `stepPlayerMovement` and `advanceBehaviors` are hardwired around `onTick`
    (`runtime/headlessRunner.ts:135-145`), outside the stage system, unreorderable. The fixed
    accumulator (`game/systemRuntime.ts:96-104`) has **no substep cap** (spiral of death) while
    `PhysicsWorld` right beside it has `maxSubsteps`. **No interpolation exists anywhere** — a
    30Hz system renders as stutter with no fix short of a core change.
20. **Entity store defeats its own spatial index.** `Map<string, SceneEntity>`, closed struct
    (`role: "player"|"npc"|"prop"`), no components, extension only via `meta: unknown`. Every
    write fans out synchronously to every subscriber and bumps `spatialGeneration`, rebuilding
    the ENTIRE grid (`scene/spatial.ts:114-149`). Move-entity-then-query-neighbors is **O(N²)
    per frame**. `setPose` allocates a fresh 3-tuple per call. Fix: dirty sets + incremental
    grid update.
21. **Physics has no rotation at all.** Zero hits for `angular|quat|torque|inertia` in
    `physicsWorld.ts`. AABB forever — no tumbling vehicle, ragdoll, or toppling crate. The
    solver itself is excellent (SoA Float32Array, grid broadphase, sequential impulses,
    sleeping, joints) and is **almost entirely bypassed**: 7 separate collision
    implementations, 5 independent spatial hash grids, 2 gravity integrators
    (`movement/movementModel.ts:278` vs `physicsWorld.ts:731`), the same ray-sphere quadratic
    written twice (`scene/sceneRaycast.ts:104` and `multiplayer/lagCompensation.ts:127`).
    `ballisticSweep.ts:33` and `forceVolume.ts:180` do full O(n) scans past the grid sitting
    next to them. **`PhysicsWorld` has no snapshot/hydrate** — physics is outside both save and
    replication.
22. **Replication serializes the whole world every commit.** `SnapshotModule.version()` is
    module-granularity, so entities are dirty the instant anything moves. Area-of-interest
    filtering runs AFTER the full snapshot is materialized. No dirty bits, deltas, or
    quantization.
23. **Flat React scene tree.** Every entity is its own element with its own `useFrame` and GLB
    clone; `AuthoredScene.tsx:297-315` mounts the entire document at once; culling keeps
    components mounted and ticking. **Editor-placed props are never instanced** — 10k props =
    10k draw calls. Instancing exists but only for procedural scatter/city.
24. **Animation is a 3-state FSM** (`idle|walk|run` on scalar speed). No IK, blend trees,
    morphs, root motion, or animation notifies (so no hit frames / foot plants). Skeletal
    animation exists only on the per-entity path; the instanced path is un-skinned boxes —
    **no route to hundreds of animated humanoids.** A third disjoint system (`PartMotion.tsx`)
    cannot blend with the mixer path at all.
25. **Feel constants are module globals.** `MOVEMENT_TUNING` (accel 26, friction 18, gravity 24)
    is shared by every game — a heavy mech and a sprinter move identically. Only
    `backpedalSpeedMultiplier` is overridable.
26. **Audio:** distance-attenuation only, no `PannerNode`/HRTF — and
    `setListenerPose(position: Vec3)` carries no orientation, so L/R cannot be derived; widen
    that signature first. No ducking/sidechain. `crossfadeTo` drives all other layers to 0, so
    vertical music stems are foreclosed. No streaming (everything is a decoded `AudioBuffer`).
    **Zero audio assets in the repo** and no audio catalog in `packages/assets`. 2 of 11 games
    have any audio; none use the positional path.
27. **~10% of core is unreachable** — 2 fully dead modules, ~47 test-only dead (written, tested,
    barrel-exported, imported by nothing). `world/lod.ts` is the archetype: a correct
    distance-banded LOD scheduler with 8 tests, exported, wired into zero systems. Same for
    `visibility/simulationCulling.ts`, `ai/interestScheduler.ts`, the whole
    `ai/{flock,crowd,populationDirector,laneSelect}` cluster.
    *(Caveat: static in-repo graph — some may be reachable by external deep import. Verify
    before deleting.)*

---

## PHASE 4 — Process hygiene

- **Gate is red on `main`** — 6 papercuts across 3 models, two causes: `check-game-shape`
  rejecting `vice-isle/src/editorKinds.ts`, and `exportManifest.test.ts` drift landing
  unregenerated. The `&&` chain short-circuits before `check-types-all`, masking everything.
  Fix the chain to run all checks and report all failures.
- **`ship:preflight` is self-contradictory** — rejects a dirty tree AND requires a committed
  branch diff; "run before shipping" is impossible as written.
- **Generated-artifact churn** — 4 papercuts on `gen:capabilities` / `gen:skill-api` /
  `gen:export-manifest` needing re-runs in sequence, sometimes after a full build.
- **`create` fails its own standard** — `--world` is opt-in, so default output is untextured
  proxy geometry, which the scaffold's own emitted `AGENTS.md:1475` declares a FAILING result.
  Default `--world` on.
- **The mandated game front-end doesn't exist** — CLAUDE.md requires New Game/Continue/settings/
  credits; grep across all games returns **one hit** (`vice-isle/TitleScreen.tsx`). 10 of 11
  have no title screen, none have pause. Nothing gates it. Either gate it or drop the invariant.
- **Related open issues:** #1146 (capability adoption sweep), #1139 (capability-first adoption
  program), #1320 (API consistency audit). Phases 0-2 largely execute these.

---

## Suggested PR sequence
1. Phase 0 (docs contradiction + entrypoint dedupe) — 1 PR, unblocks all future games.
2. Phase 1.2 ratchet + Phase 2.3 cheap wins — 1 PR, makes regressions impossible.
3. Phase 1.1 export curation + #1320 naming reconciliation — 1 PR, breaking, own release.
4. Phase 2.1/2.2 migrations — one PR per game, mechanical once the ratchet exists.
5. Phase 3a — 1 PR, immediate visible win, screenshots required.
6. Phase 3b/3c/3d/3e — one tracked `[FEATURE]` issue each, scheduled independently.

Per CLAUDE.md: any PR touching a rendered surface needs before/after screenshots via
`bun run shoot`/`drive`; behavior changes need a clip via `bun run pr-video`.