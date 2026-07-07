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

- **Physics joints & constraints** — `PhysicsWorld` gains `hingeJoint`/`fixedJoint`/`distanceJoint`/`springJoint(JointOptions)` between two bodies or a body and a fixed world point, plus `removeJoint`, `setJointAnchor` (move a follow point), `setJointRest`, and `readJointSegments`. The sim is translational: `hinge`/`fixed` pin the shared anchor, `distance` holds a separation, `spring` drives toward `restLength` with stiffness/damping. Foundation under vehicle suspension, ragdolls, grapples, and carry. Tune the buffers with `jointCapacity` / `jointCorrection` in `PhysicsWorldConfig`.
- **Physics collision → gameplay-event hook** — `PhysicsWorld.onCollision(listener, minApproachSpeed?)` delivers each impacting contact as a reused `CollisionEvent { a, b, nx, ny, nz, approachSpeed, impulse }` during `step`. The seam crash-damage and destruction read; contacts otherwise stay inside the sim.
- **`@jgengine/core/physics/ragdoll`** — `createRagdoll(world, { bones, links, balance? })` builds a jointed multi-body character on the joint API: floppy by default, or active-ragdoll when a balance motor drives the root toward a target height (`Ragdoll.balance(dt, moveX?, moveZ?)`), with `centerOfMass`, `applyImpulse`, `remove`.
- **`@jgengine/core/physics/carryable`** — `Carryable` grabs a physics body to a moving follow point via a spring constraint (the raycast pick is the caller's), supports shared multi-owner carry (follow point = owner average), drop/throw, and `carrySpeedMultiplier(mass, capacity, owners)` encumbrance.
- **`@jgengine/core/physics/forceVolume`** — `ForceVolume` (impulse/velocity/accelerate trigger region, `once` for boost pads vs continuous fans) and `PlatformCarry` (carry bodies standing on a moving platform by its per-`step` delta).
- **`@jgengine/core/physics/spatialGrid`** — `SpatialGrid`, a broad-phase uniform grid over the x/z plane, separate from the rigid-body sim, for cheap same-tick proximity across hundreds–thousands of simple movers: `rebuild(count, xs, zs)` then `queryCircle` (swarm enemies hitting a player/AoE) or `forEachPair` (mutual separation).
- **`@jgengine/shell/world/InstancedJoints`** — debug LineSegments overlay drawing a `PhysicsWorld`'s active joints from `readJointSegments`.
- **`@jgengine/core/physics/traversal`** — `Grapple` (a fired-anchor rope on the joint API: `fire`/`reel`/`payOut`/`moveAnchor`/`release` for grapple, zipline, and swing traversal) and `Glide` (reduced-gravity, forward-thrust wingsuit/glider via `apply(dt, steerX, steerZ)` before `step`). Grapple/zipline/glide (Sekiro, Deep Rock, Enshrouded) over the shared physics sim.
- **`@jgengine/core/world/carve`** — runtime destructible terrain. `VoxelVolume` is an editable dense voxel grid with `carve`/`deposit` sphere ops honouring per-material `strength` against a tool (Deep Rock dig, Astroneer deposit); `CarvableField` / `carvableTerrain(base)` writes craters and mounds back into any `TerrainField`'s height so ground-snap, collision, and the terrain mesh all see the deformation (Helldivers 2 craters).
- **`@jgengine/core/physics/structure`** — `StructureGraph`, a structural-integrity graph over a building: nodes (pieces), load-bearing edges, anchored foundations. `damage`/`damageEdge`/`severEdge` recompute reachability to an anchor and return one `CollapseEvent` of every newly-disconnected piece; `toDebris(world, event)` sinks the fallen pieces into a `PhysicsWorld` as rigid bodies. Coarse by design — the collapse **event** replicates, not each fragment (The Finals, Rainbow Six).
- **`@jgengine/shell/terrain/CarvedTerrain`** — meshes any `TerrainField` (a `CarvableField` with its craters/mounds) into a vertex-coloured deformed ground; `createFieldGroundGeometry` is the underlying geometry builder.

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
