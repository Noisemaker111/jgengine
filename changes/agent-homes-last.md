One exported name, one definition, outside the world/render areas: `check concept-homes --all` goes from 68 names to 25, all in camera, culling/visibility, roads/city, scatter, terrain, LOD and building instancing (the world/render lane's).

### Migrate

- One exported name, one definition. Renamed:
  - `Mood` in `@jgengine/core/render/lookMood` → `LookMood`; `Mood` is the agent mood in `@jgengine/core/agents/mood`.
  - `Footprint` in `@jgengine/core/inventory/shapedGrid` → `CellFootprint`; `Footprint` is the `{ w, d }` box in `@jgengine/core/world/geometry`.
  - `PlayableGame` in `@jgengine/core/game/playableGame` → `PlayableGameContract`; `PlayableGame` is the shell type games use (`@jgengine/shell/registry`).
  - `@jgengine/ws/host` and `@jgengine/node/host`: `GameHost` → `GameServerHost`, `createGameHost` → `createGameServerHost`, `GameHostOptions` → `GameServerHostOptions`. `GameHost` is the shell component.
  - `pathLength` in `@jgengine/core/nav/pathFollow` → `followPathLength`; its `HeightSampler` → `HeightSource`.
  - `Job` in `@jgengine/core/ai/jobBoard` → `StationJob`. `inGridBounds` in `@jgengine/core/editor/grid` → `inLayerBounds`. `SnapMode` in `@jgengine/editor` → `EditorSnapMode`.
  - `AssetRef` in `@jgengine/core/game/tribe` → `TribeAssetRef`. `BufferedAction` in `@jgengine/core/time/beatClock` → `BeatBufferedAction`. `HarvestResult` in `@jgengine/core/crafting/crop` → `CropHarvest`.
  - `ObjectRaycastHit` in `@jgengine/core/combat/projectiles` → `ProjectileObjectHit`. `WallSegment` in `@jgengine/core/scene/sceneRaycast` → `RaycastWall`. `PolylineHit` in `@jgengine/core/world/polylineIndex` → `PolylineIndexHit`.
  - `HitReactionInput` in `@jgengine/core/runtime/gameContext` → `EntityHitReactionInput`. `ThresholdDirection` in `@jgengine/core/game/objectives` → `ObjectiveDirection`.
  - `LeaderboardRow` in `@jgengine/core/runtime/hostPersistence` → `StoredLeaderboardRow` (the game `LeaderboardRow` plus `gameId` and `updatedAt`). `RunCommandArgs` in `@jgengine/convex/server` → `ConvexRunCommandArgs`.
  - `FrameTelemetry` interface in `@jgengine/shell/devtools/frameSampler` → `FrameSampler`.
- `@jgengine/core/world/vec2` and `vec3` export one object each: `vec3.distance(a, b)` instead of `import { distance }`.
- Thresholds live in `@jgengine/core/threshold/`: `relation/thresholds` → `threshold/thresholds`; `combat/thresholdCrossings` → `threshold/thresholdTracker`, whose `ThresholdMark` is now `ThresholdBoundary` and whose emitted `ThresholdCrossing` is `ThresholdTrackerCrossing`. The accumulator meter's `tierAt` is gone; use `tierAt(tiers, value)?.id` from `threshold/thresholds`.
- One waypoint store: `createWaypointTracker` and its `Waypoint`/`WaypointTracker` types are removed from `@jgengine/core/ui/screenMarkers`. Use `createWaypointStore` (`@jgengine/core/world/waypoints`); `place([x, z], { height })` sets the screen-marker anchor, and `WaypointMarkers` takes the store.
- Moved: `MAX_SESSION_ID_LENGTH` → `@jgengine/core/runtime/hostPolicy`. `SessionVisibility` → `@jgengine/core/multiplayer/matchmaking` only. `Vec2` from `movement/formation`, `Vec3` from `anim/ikSolver` and `world/buildings` → `@jgengine/core/world/geometry`. The `{ x, y, z }` `Vec3` of `multiplayer/lagCompensation` and shell audio → `Xyz` (`@jgengine/core/math/xyz`).
- `CreatorConfig` is no longer re-exported by `@jgengine/editor`; use `CreatorConfig<PlayableGame>` from `@jgengine/core/editor/creatorStorage`.

### Changed

- `check concept-homes` no longer counts `export const …` lines inside a generator's template literal (assets `indexGen`/`spriteIndexGen`) as definitions.

Verification:
- `bun scripts/check-concept-homes.ts --all`: 25 names left, all world/render
- `bun scripts/check-types-all.ts`: 23 dirs, 0 failing; every game's `check-types`: pass
- `bun test` on threshold, stats, vec2/vec3, waypoints, ui, movement, combat, nav, ws, node, convex, shell audio: 1693 pass

## Bends

- None. The concept-homes template-literal skip removes false positives only (text a generator prints is not a definition); it has its own test.
