# Changelog

All eight `@jgengine/*` packages are versioned in lockstep, so this one file
covers every release. Format follows [Keep a Changelog](https://keepachangelog.com);
each release **leads with a Migrate block** — the concrete steps to move a game
from the previous version onto the new APIs — because the point of a bump is to
let consumers pick up the better stuff, not just to list what moved.

Agents building on the published SDK can also read this programmatically:
`import { VERSION, CHANGELOG } from "@jgengine/core/meta/changelog"` gives the
same data as typed values, so an updater can diff its installed version against
the latest and surface the migration steps.

## Unreleased

### Added

- **Camera rig library** (`@jgengine/shell`, config types in `@jgengine/core/game/playableGame`) — the single orbit camera is now one of eight rigs, selected and tuned through `PlayableGame.camera` (never by writing camera positions from `onTick`). Set `camera.rig`:
  - `topDown` — fixed height/pitch/yaw with decoupled follow for ARPG-iso and top-down (Diablo IV/PoE 2/Last Epoch, Hades II); `camera.topDown: { height, pitch, yaw, followSmoothing, zoom }`.
  - `rts` — free-pan / edge-scroll / rotate / zoom independent of any avatar (The Sims 4, Manor Lords, Two Point Museum); `camera.rts: { panSpeed, edgeScroll, rotateSpeed, bounds, start }`.
  - `shoulder` — over-the-shoulder with ADS transition and shoulder-swap, reticle decoupled from camera center (Remnant II, Helldivers 2, The First Descendant); `camera.shoulder: { shoulderOffset, distance, ads, side }`.
  - `lockOn` — yaw bound to the player→target vector with the move axis reinterpreted as strafe (Elden Ring, Sekiro); `camera.lockOn: { targetEntityId?, distance, framingBias, yawSmoothing }`.
  - `chase` — speed-reactive vehicle chase (speed→FOV curve, spring-arm damping, procedural shake) plus fixed `cockpit`/`hood`/`rear` views (Forza Horizon 5, Rocket League, Trackmania); `camera.chase: { distance, springDamping, fov, shakePerSpeed, view }`.
- **Every rig accepts `followEntityId: null`** — avatar-less games (city-builders, card games, auto-battlers) can now mount a camera; the orbit rig no longer bails when there is no follow target.
- **Camera-shake / trauma channel** — every rig reads a shared trauma channel; feed it from any system with `import { cameraShake } from "@jgengine/shell/camera"` (`cameraShake(amplitude, decayPerSecond?)`, amplitude 0..1) or from React via `useCameraShake()`. Tune with `camera.shake: { maxOffset, maxRoll, decayPerSecond, exponent, frequency }`. (Combat hitstop and other systems feed the same channel.)
- **Cinematic camera + mode-swap cross-fade** — `camera.cinematic: { keyframes: [{ position, lookAt, fov?, duration?, ease? }], loop? }` plays a scripted keyframe path over the active rig, and `camera.transitionSeconds` cross-fades the camera when the rig changes so mode swaps no longer hard-cut.
- Pure rig math (shake decay/trauma, spring-arm damping, speed→FOV, lerp/cross-fade, offset/strafe vectors, keyframe sampling) is exported from `@jgengine/shell/camera` as testable functions.
- **Possession** (`@jgengine/core/scene/possession`, `createPossession`) — a player can own N scene entities and switch which one is under active control, distinct from the social party. `ctx.player.possession.own/disown/owns/listOwned(userId, entityId)` tracks ownership; `possess(userId, entityId)` swaps active control (rejecting entities the user doesn't own), flips the previous/next entity's `EntityRole` between `"player"`/`"npc"` (reusing entity control, not forking it), and emits `possession.swapped`. `active(userId)` defaults to `userId` itself until a swap happens. `@jgengine/shell`'s `GamePlayerShell` rebinds WASD movement, targeting, hotbar `from`, and the camera rig's `followEntityId` to the active possessed entity on every swap — no per-game camera glue required.
- **Form / shapeshift** (`@jgengine/core/scene/form`, `createForms`) — a `form` bundles movement params + an ability-id list + a mesh (reusing the entity's catalog name, so mesh, movement defaults, and receive/role all follow the swap through the existing name-keyed resolution — no parallel mesh system). `ctx.scene.entity.form.register(defs)` in `onInit`; `shapeshift(instanceId, formId, durationSeconds?)` applies the bundle and optionally reverts automatically after `durationSeconds` of **game time** (`ctx.time.after`, so it obeys pause/fast-forward); `revert(instanceId)` reverts early. Emits `form.changed`.
- **Cosmetic loadouts + emote broadcast** (`@jgengine/core/game/cosmetics` `createCosmetics`; `@jgengine/core/game/social` `Social.emotes`) — `ctx.player.cosmetics.register(defs)` + `apply(userId, loadoutId)` / `equip(userId, slot, cosmeticId)` manage a per-player cosmetic slot map (skin/back/aura/…), emitting `cosmetics.changed`. `ctx.game.social.emotes.play(fromUserId, emoteId, radius?)` broadcasts to nearby **player**-role entities (reusing `scene.entity.inRadius`, not a parallel proximity system) and emits `emote.played` — bind it through the existing `ctx.game.feed` primitive (`feed.bind("emote.played")`) for a HUD feed, no new hook needed.
- `entityStore`'s `update()` patch now also accepts `name`, so possession/form (and any future system) can retarget an instance's catalog id without despawn/respawn.

### Migrate

- No change required — additive. Existing games keep the orbit camera (`perspective: "third"`) and first-person (`perspective: "first"`) exactly as before. Opt into a new rig with `camera.rig` and its config block.
- No change required — possession, forms, cosmetics, and emotes are new opt-in primitives; `ctx.player.possession.active(userId)` defaults to `userId` and every existing game continues to control its single spawned player entity exactly as before.

## 0.6.0

An additive release: **every 0.5.0 API is unchanged**, so upgrading is only a
version bump. The headline is a whole outdoor-world layer — composable
`environment(...)` descriptors, renderer-free query primitives so gameplay reads
the same world the shell renders, a standalone rigid-body physics sim, and the
`@jgengine/shell` renderers that draw it all.

### Migrate

- Bump every `@jgengine/*` dependency to `^0.6.0` (the eight packages version in lockstep).
- No code change is required — 0.6.0 adds surface, it doesn't move or remove any.
- Optional: describe an outdoor scene once with `environment({ terrain, weather, vegetation, water, structures })` from `@jgengine/core/world/features`. `@jgengine/shell`'s `EnvironmentScene` renders it (terrain, rain/snow, grass, ocean, buildings), and gameplay reads the same world through the renderer-free primitives — `resolveTerrainField(...)` for ground-snap/collision, `windField(...)` for sway/sailing, `waterSurface(...)` for buoyancy, `scatter(...)` for prop/spawn placement, `buildingIndex(...)` for placement avoidance — no three.js needed.

### Added

- `@jgengine/core/world` query primitives — pure, renderer-free world sampling so gameplay and rendering read one source of truth. `world/terrain` (`TerrainField`, `noiseField`, `resolveTerrainField`, `resolveGroundStep` for slope-limited movement), `world/wind` (`windField` — one wind source for weather sway, grass, sailing, fire spread), `world/water` (`waterSurface` / `waterSurfaceFromDescriptor` — CPU Gerstner matching the ocean shader, for buoyancy and shorelines), `world/scatter` (`scatter` — seeded, overlap-aware point distribution for vegetation/props/spawns), `world/buildings` (`generateBuilding`, `generateBuildingDistrict`) and `world/buildingIndex` (`buildingIndex` — `at`/`within`/`nearest`/`isInside`/`blockers` over a district).
- `@jgengine/core/world/features` composable outdoor descriptors — `environment(...)` plus `terrain()`, `rain()`, `snow()`, `grass()`, `ocean()`, `building()`.
- `@jgengine/core/world/regions` (`createRegionField` — blend content-agnostic biomes by nearest selector, adding `tint`/`water`/`fog`/`speedMultiplier`/opaque `data`; extends `TerrainField` so it ground-snaps too) and `@jgengine/core/world/scatterItems` (`scatterItems` — region-driven content scatter: density per region, grounded, above-water/slope-aware, with `pickWeighted` for weighted rolls).
- `@jgengine/core/physics/physicsWorld` — standalone fixed-capacity rigid-body sim (SoA buffers, spatial-hash broadphase, sleeping) for many colliding dynamic bodies (piles, debris, stress scenes). Distinct from the `defineGame` `physics: { gravity }` character-controller config.
- `ctx.time` simulation clock (`@jgengine/core/time/simClock`) — `onTick`'s `dt` is now **game time**, so `rate * dt` decay/regen/AI obeys pause and fast-forward for free without per-system wiring. Configure with `defineGame({ time: { scale?, speeds?, dayLength?, start?, startPaused? } })` (all optional; default is real-time 1:1). `ctx.time` exposes `pause`/`play`/`toggle`/`setSpeed`/`cycleSpeed` + `snapshot()`/`calendar()`; `useGameClock()` binds it in React.
- `@jgengine/shell` environment/terrain/water/weather/structures renderers — `EnvironmentScene` mounts an `environment()` descriptor as R3F renderers; `GrassField`, `ProceduralGround`, `Ocean`, `RainField`, `SnowField`, `LightningStrike`, `GeneratedBuilding`, and `world/InstancedBodies` (renders `PhysicsWorld` bodies).
- `@jgengine/react/liveBind` — `useFrameBind` drives a DOM/SVG element from a per-frame value without re-rendering React (HUDs bound to live engine state never re-render or lag).

## 0.5.0

An additive release: **every 0.4.0 API is unchanged**, so upgrading is only a
version bump. New pure primitives across progression, inventory slots, world
geometry, and React store bindings.

### Migrate

- Bump every `@jgengine/*` dependency to `^0.5.0` (the eight packages version in lockstep).
- No code change is required — 0.5.0 adds surface, it doesn't move or remove any.
- Optional: replace a game's hand-rolled `progression/curves.ts` with the new `leveling(...)` track. `leveling({ xpForLevel: { kind: "power", base, exponent, round: "floor" }, maxLevel })` returns `xpForLevel`, `resolve`, and `grantXp(ctx.scene.entity.stats, userId, amount, onLevelUp?)` — a drop-in for the old `xpRequiredForLevel` / `resolveLevelProgress` / `grantXp` exports. `ctx.scene.entity.stats` satisfies the primitive's `LevelingStatAccess` structurally, so no adapter is needed.

### Added

- `@jgengine/core/game/progression` — genre-agnostic progression primitive. `curve(spec)` / `evalCurve(spec, x)` evaluate declarative scalar curves (`const`, `linear`, `power`, `geometric`, `steps`, `piecewise`, each with optional `round`/`min`/`max`) for speed-by-level, difficulty-by-wave, loot drop-rate ramps, and similar scaling. `leveling(config)` builds the stateful XP→level track (threshold accumulation, multi-level grants, cap handling, `stat.levelUp` emit) on top of an `xpForLevel` curve.
- `@jgengine/core/inventory/slotModel` — pure slot-grid primitives (`createSlots`, `placeAt`, `removeAt`, `moveSlot`).
- `@jgengine/core/world/geometry`, `/world/interiors`, `/world/placement` — pure world primitives: grid snapping, footprint AABBs and overlap, interior/exterior spaces, and placement validation.
- `@jgengine/react/engineStore` — raw-store React bindings (`useEngineState`, `useEngineStore`, `useEngineEvent`).
- Pure/functional tiers for the `trade`, `unlocks`, `quest`, and `feed` verbs in `@jgengine/core/game`.

## 0.4.0

Baseline release: the eight `@jgengine/*` packages (core, ws, sql, react,
convex, node, shell, assets) as the first tracked version. No migration —
this is the floor changelog entries are measured against.
