# Engine gap analysis — MECCHA CHAMELEON

**Question:** could a game built on JGengine reproduce *MECCHA CHAMELEON*, and if not, what is missing from the engine?

**Answer:** the match plumbing is largely there; the four mechanics that *are* the game are not. A team could ship the lobby, the timer, the multiplayer host, the first-person seeker, and the shoot-to-tag loop today. They could not, without building it all themselves on raw three.js, ship the one thing the game is named after: paint your own body, sample the wall's colour, strike a pose, and have every other player see the disguise.

This is a research note, not a spec. Evidence is cited to real files under `packages/*/src` so each gap is checkable.

---

## The game

*MECCHA CHAMELEON* (solo dev **lemorion_1224**, Steam, released 9 June 2026, $5.99, 2–10 players) is an asymmetric hide-and-seek game that sold >15M copies in its first month. A round runs **lobby → prep → hunt**:

- **Hiders** spawn as **blank white mannequins**. During prep they roam the stage, then execute a four-part disguise where *colour, pose, placement and surface must all agree*:
  1. **Eyedropper** — point at the exact wall/prop and sample its colour precisely (no eyeballing).
  2. **Paint the body** — a paint UI with a colour wheel, RGB/HSV sliders, and **metallic + roughness (PBR) controls**; add a light side and a shadow side, kill the metallic sheen so you read as matte surface.
  3. **Pose** — pick a full-body pose from a library to break the human silhouette (seekers spot shapes faster than colour mismatches), then **freeze**. Any micro-movement during the hunt is a dead giveaway.
- **Seekers** wait blind during prep, then hunt in **first-person, no flashlight**, and **shoot (LMB) to confirm** a hider. **Misses cost seeker HP**, so they only fire on a real tell (shape, shadow, pattern break, a twitch).
- **Win:** seekers must tag *everyone* before the timer; if even one hider survives, hiders win.
- **Modes:** Normal (timed hunt), Infection (caught hiders convert to seekers), Double (everyone hides, then everyone seeks).
- **Stages** are hand-authored interiors: Indoor Hall, Vintage Room, Hide-and-Seek Mansion, Farm, Barn, Sewer, Backrooms, Penguin Hotel.

> Source note: this profile is synthesized from ~10 written sources (Steam/Wikipedia summaries, GAMES.GG / Mobalytics / allthings.how / community wiki guides, BusinessToday). Raw screenshots could not be pulled — the Steam and game-guide image CDNs are blocked by this environment's egress policy — so the visual detail here comes from descriptions, not pixels.

---

## Feature → engine coverage

| Game mechanic | Engine coverage | Verdict |
|---|---|---|
| Real-time multiplayer host, 2–10 players, snapshots, matchmaking, lag comp | `runtime/adapter`, `@jgengine/node`, `@jgengine/ws`, `@jgengine/convex`, `multiplayer/*` | ✅ strong |
| Round phases + per-phase timers + team scoring/economy | `session/roundState` | ✅ (phase names fixed — see G8) |
| First-person seeker camera | shell `first` rig | ✅ |
| Shoot-to-tag + misses cost HP | `multiplayer/lagCompensation` (`resolveHitscan`), entity `stats` | ✅ |
| "Which object is under my cursor" picking | `input/pointer` `PointerHit`, shell `pointerService` | ✅ |
| Movement stance (stand/crouch/prone) | `movement/poseState` `MovementPose` | ✅ |
| **Paint a dynamic texture onto the player's body** | — | ❌ **G1 blocking** |
| **Eyedropper: sample surface colour/PBR at a point** | — | ❌ **G2 blocking** |
| **Per-entity PBR material override at runtime** | partial (`InstancedBodies` albedo only) | ❌ **G3 blocking** |
| **Skeletal animation + selectable pose + freeze-on-pose** | — (`animationState` is frame math only) | ❌ **G4 blocking** |
| **Replicate the painted disguise to all clients** | partial (untyped JSON only, no binary/appearance channel) | ❌ **G5 blocking** |
| Camouflage / blend / "artistic skill" scoring | — (sensors are LOS/framing only) | ❌ **G6** |
| Freeze + penalize movement-while-frozen | — | ❌ **G7** |
| Asymmetric hider/seeker roles + win conditions | — (`roundState.teams` are score buckets) | ❌ **G8** |

---

## Blocking gaps (the game cannot exist without these)

### G1 — Paintable body texture *(the eponymous mechanic)*
No primitive paints a dynamic texture onto a character mesh. The two paint-shaped APIs are unrelated:
- `world/walls` `createSurfacePaint` (`packages/core/src/world/walls.ts:185`) is a key→**surface-name string** map bucketed by `PaintTarget = "floor" | "wall"` — it records "this tile uses surface X," no pixels/UVs.
- `world/terraform` `paintSurface` (`packages/core/src/world/terraform.ts:129`) writes a `surface: string | null` per terrain **grid cell**.

The shell has no paintable-mesh / render-to-texture / brush component (no `CanvasTexture`, `DataTexture`, `WebGLRenderTarget`, mesh `Decal`). Entity GLBs render as a static cloned `gltf.scene` `<primitive>` (`packages/shell/src/GamePlayerShell.tsx:196`). The only escape hatch is the `renderEntity` callback (`packages/core/src/game/playableGame.ts:299`), i.e. build it yourself on raw three.js.

**Proposed:** `scene/bodyPaint` — a serializable per-entity **stroke model** (eyedropper/brush/spray/fill strokes over a UV canvas) in core (renderer-free, unit-testable), plus a shell component that bakes it to a `CanvasTexture` and binds it as the entity material's albedo. This is the spine that G2/G3/G5 hang off.

### G2 — Eyedropper: sample surface colour/material at a point
The picking path returns geometry and identity, never appearance. `PointerHit` (`packages/core/src/input/pointer.ts:10`) is `{ point, normal, entity, object }` — no colour/material. `pointerService.worldHit()` (`packages/shell/src/pointer/pointerService.ts:52`) raycasts and reads only `point`, `face.normal`, and `userData` id tags; it never touches `hit.object.material`. There is no `sampleColor`/`albedo`/`eyedropper` anywhere.

**Proposed:** extend the hit with `material?: { color, metallic, roughness }`, or add `ctx.scene.sampleSurface(point)` — the shell reads the material (or renders a 1px pick buffer) at the hit. Feeds the paint UI directly.

### G3 — Per-entity PBR material override at runtime
`ModelConfig` (`packages/core/src/game/playableGame.ts:280`) is `{ url, scale, y, anchor, dims }` — **no colour/metallic/roughness**, and the entity render path exposes no override. The lone per-instance colour is `InstancedBodies` (`packages/shell/src/world/InstancedBodies.tsx:28`): albedo-only, on the shared physics-box material (`roughness 0.85, metalness 0` fixed), not wired to entity GLBs. The game's metallic/roughness sliders have nowhere to land.

**Proposed:** a `material?: { color?, metallic?, roughness?, map? }` channel on entity render state + a `ctx.scene.entity.setMaterial(id, …)` verb; the G1 paint canvas plugs in as `map`.

### G4 — Skeletal animation + pose library + freeze-on-pose
The shell runs **no** skeletal animation — no `AnimationMixer`/`useAnimations`/`clipAction` anywhere in `packages/*`; GLB clips are loaded then dropped as a static scene. `combat/animationState` (`packages/core/src/combat/animationState.ts:77`) is a renderer-free timing state machine (windup/active/recovery frames for combat), not rendered animation. The "pose" symbols are stances, not rig poses: `EntityPose` is a transform setter, `MovementPose` is `standing|crouch|prone|running`. There is no humanoid pose library and no way to hold a rigged avatar on a chosen pose/frame.

This blocks both the **pose-as-disguise** mechanic *and* basic character motion (walking hiders in prep, moving seekers).

**Proposed:** bind an `AnimationMixer` for entity GLBs in the shell (clip selection via `entityModels`), plus `scene/poseLibrary` — named full-body poses with hold-on-frame. Core owns pose ids + clip timing; shell owns the mixer.

### G5 — Replicate the painted disguise to all clients
A hider's paint must be seen by everyone, yet the replicated entity row carries none of it. `RuntimeEntityRow` (`packages/core/src/runtime/snapshot.ts`) is `position, rotationY, stats, target…` — no appearance/texture field. The ws protocol is JSON text only (`packages/ws/src/protocol.ts` `encodeWsMessage = JSON.stringify`, no binary frame); `WsPose` is a fixed 5-float struct. `game/cosmetics` carries only **string cosmetic ids** and isn't even wired into the runtime snapshot/persistence (no callers of `cosmetics.snapshot`/`hydrate`). A painted texture can only ride as hand-base64'd JSON through the untyped `serverState`/`playerState`/feed channels — no delta, no chunking, no per-entity appearance field.

**Proposed:** a replicated per-entity **appearance/paint** field (the G1 stroke list is compact and delta-friendly) in the snapshot model, and a binary/compact channel in the ws codec so disguises sync efficiently.

---

## Supporting gaps (buildable per-game, but the engine gives no primitive)

### G6 — Camouflage / blend / "artistic skill" scoring
Every sensor is geometric: `sensor/revealQuery` (radius, ignores occlusion), `sensor/hiddenStateProbe` (reads a named hidden variable with falloff), `sensor/frustumSensor` (in-frustum + framing + dwell-time). None compares an entity's appearance against its background. No `camouflage`/`conceal`/`blend`/`detectability`/`silhouette` primitive exists. This powers the "artistic skill" rating and is a hard prerequisite for any **AI seeker**.

**Proposed:** `sensor/concealment` — score blend from paint-vs-sampled-background colour delta + silhouette break + `frustumSensor` framing.

### G7 — Freeze / hold-still enforcement
No per-entity freeze state and no movement-while-frozen penalty (`freeze`/`frozen` in engine hits only the global `simClock` pause). Raw signal exists — `entityStore` derives per-entity `velocity` from consecutive `setPose` calls, and `multiplayer/poseSyncGate` has movement epsilons — but nothing locks a hider or scores the twitch that gives them away.

**Proposed:** `scene/freezeState` — lock + movement-delta detector over `entityStore.velocity`.

### G8 — Asymmetric roles + win conditions (+ phase-name friction)
`session/roundState` gives phases, per-phase timers, and per-team scoring/economy — but `teams` are opaque score buckets and `concludeRound(winner)` makes the **game** decide who won. No primitive assigns players to hider/seeker and no evaluator encodes "seekers win by tagging all / hiders win at timer end." `EntityRole` (`player|npc|prop`) and `PartyRole` (`leader|member`) are not game factions. `game/race.lastStanding` is the closest reusable win pattern but is lap/checkpoint-shaped. Separately, `roundState` phases are **hardcoded** to `buy|live|end` (`PHASE_ORDER`), so lobby/prep/hunt must be mapped onto three fixed slots.

**Proposed:** `session/roles` (asymmetric team/role assignment + pluggable win evaluators, shipping `findAll` / `lastTeamStanding`), and make `roundState` phase names/count configurable.

### Secondary — authored-interior collision *(needs confirmation)*
The stages are detailed hand-authored interiors, but engine physics is footprint/AABB/voxel-shaped (`world/geometry`, `physics/physicsWorld`). Arbitrary GLB level-mesh collision was not verified here and may be a gap for precise "press into the corner" hiding. Lower priority since human seekers, not physics, do the detecting.

---

## Recommended build order

The five blocking gaps chain off one spine — build G1 first and G2/G3/G5 slot into it:

1. **G1 `scene/bodyPaint`** — the paintable stroke model + shell canvas bake. Everything else references it.
2. **G2 surface sampling** — the eyedropper the paint UI consumes.
3. **G3 per-entity material channel** — where paint + metallic/roughness render.
4. **G4 skeletal animation + `scene/poseLibrary`** — poses and character motion.
5. **G5 appearance replication** — sync the disguise to all clients.
6. **G6 `sensor/concealment`**, **G7 `scene/freezeState`**, **G8 `session/roles`** — scoring, freeze, and roles/win conditions.

All eight fit the engine's own convention — verbs/primitives in core, rendering in shell — and follow the same gap-driven pattern as the v0.7.0 engine-gaps sweep. None is a game-specific noun; each is a primitive multiple hide/disguise/paint games would reuse.
