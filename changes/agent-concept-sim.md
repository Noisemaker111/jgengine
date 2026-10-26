### Migrate

- Flight lives in `flight/`: `@jgengine/core/movement/freeFlight` → `@jgengine/core/flight/freeFlight`; `@jgengine/core/physics/aircraftDynamics` → `@jgengine/core/flight/aircraftDynamics`.
- Spatial indexes live in `spatial/`: `@jgengine/core/visibility/spatialIndex` → `@jgengine/core/spatial/spatialIndex`; `world/spatialBuckets` → `spatial/spatialBuckets`. `SpatialGrid` (`physics/spatialGrid`) is removed; use `createSpatialIndex`.
- The falling-block grid lives in `puzzle/`: `@jgengine/core/tactics/fallingGrid` → `@jgengine/core/puzzle/fallingGrid`. `puzzle/fallingPiece` is removed; its shape tables, drop distance, level and line score are `ShapeTable`, `pieceFootprint`, `dropDistance`, `levelForLines` and `lineClearScore` in `puzzle/fallingGrid`.
- `Grapple` and `Glide` (`physics/traversal`) are removed; use `createGrappleSwing` and `createGlideModel` (`movement/`). `createGrappleSwing` gains `maxLength` (`fire` returns `false` past it) and `moveAnchor`.
- `createDecayMeterSet` and `DecayMeterSet` are removed; `createNeedSet` (`@jgengine/core/sim/needs`) is the one meter set. Map `serialize()` → `snapshot()`, `snapshot()` → `states()`, and `DecayMeterSetState` → `NeedSnapshot`. It gains `state(id)`, `states()` and `moodles()`. The `@jgengine/core/procedural` barrel exports `createNeedSet`.
- The navmesh free functions `findPath(mesh, …)` and `closestPoint(mesh, …)` are removed; call them on `createNavMeshQuery(mesh)`.
