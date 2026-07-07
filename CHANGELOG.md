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

- **Navigation & pointer-driven input.** A renderer-free foundation for click-to-move, RTS unit command, and pointer verbs.
  - `@jgengine/core/nav/navGrid` — a walkable grid + A* pathfinding (`createNavGrid`, `findPath`, `smoothPath`); blocked start/goal snap to the nearest walkable cell, paths are string-pulled, and one graph feeds both click-to-move and AI routing.
  - `@jgengine/core/nav/pathFollow` — an authored-polyline mover for tower-defense creeps needing no navmesh (`createPathFollow` + pure `advancePathFollow`); `pathFromNav` lifts an A* route so the same follower drives click-to-move.
  - `@jgengine/core/input/pointer` — the renderer-free `PointerHit` contract (`{ point, normal, entity, object }`) plus `aimToPoint` / `moveTargetFromHit` / `groundOf` so gameplay consumes cursor hits (aim, move-to, routing) without three.js.
  - `@jgengine/core/scene/selection` — pure box-select math (`createSelectionSet`, `screenRect`, `selectWithinRect`, `isMarquee`).
  - `@jgengine/core/interaction/contextMenu` — `contextVerb` / `buildContextMenu` / `contextVerbInput`; catalog entities/objects carry `verbs` for right-click menus.
  - `PlayableGame.pointer` config (`moveCommand`, `select`, `orderCommand`, `contextMenu`, `aim`) — the `@jgengine/shell` `GamePlayerShell` casts the cursor (`pointer.worldHit()`), renders a drag-marquee + right-click verb menu, routes primary-ability aim to the cursor, and remaps orbit to middle-drag so the left button drives verbs.

- **Interactive placement, building & terraform.** Data-only placement becomes the build tooling of Valheim/Enshrouded/The Sims/Fortnite/Dinkum/Palia, all pure `@jgengine/core/world` driven by `pointer.worldHit()`, with shell renderers for the ghost/tint/brush.
  - `@jgengine/core/world/placementController` — `createPlacementController(footprint)` owns the placement ghost: `hover(hit)` → `PlacementPreview` (valid/invalid tint wrapping `validatePlacement`), `rotate`, grid/free/surface `snapMode`, `commit` → `PlacementCommit`.
  - `@jgengine/core/world/connectors` — typed connector sockets with `snapToNearest` snap-to-nearest-compatible (`socketsCompatible`, `worldSockets`).
  - `@jgengine/core/world/support` — `solveSupport` walks the connector graph to ground (`supported`/`unsupported`/hop-`distance` for white→red decay); `toDebrisBodies` sinks collapsed pieces into the `PhysicsWorld`.
  - `@jgengine/core/world/walls` — `createWallDrawTool` (drag walls → auto-enclose → `footprintFromWalls` → `autoRoof` hip/gable/flat) plus `createSurfacePaint` for per-tile floor/wall surfaces.
  - `@jgengine/core/world/placedStructureStore` — `createPlacedStructureStore` save/load/select/move/delete with a `snapshot`↔`load` round-trip that survives reload.
  - `@jgengine/core/world/terraform` — `createEditableTerrain({ bounds, base, cellSize })` makes a `TerrainField` you can **write back to** via `apply(edit)` (raise/lower/flatten/paint), and `createTerraformBrush` is the cursor tool. This height-offset grid is the shared terrain-edit write-back pattern.
  - `@jgengine/core/world/buildPermissions` — `createPlotPermissions` (per-plot/guild `BuildRole` edit authority) + `createContributionPool` (co-op pooled-resource contribution model).
  - `@jgengine/shell` renderers: `structures/PlacementGhost` (tinted ghost), `terrain/EditableGround` (renders an `EditableTerrain` with surface paint), `terrain/TerraformBrushCursor` (brush ring); the `builder-sandbox` demo game wires them to `pointer.worldHit()`.

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
