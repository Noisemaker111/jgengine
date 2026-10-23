### Added

- `ObjectStore.version()` / `ObjectStore.markSpatialChange()` (`ctx.scene.object`) — a counter that moves whenever membership, a position, a rotation or a consumer-owned collider set changes, so derived spells spatial data can share one cache key.
- `SolidObstacleSource.version?()` (`@jgengine/core/movement/solidObstacles`) — a source that reports one gets its blocking obstacles resolved once per version into a coarse XZ index; a source without it keeps the per-query `inBox` gather.

### Changed

- Movement gathers obstacles from that index instead of re-resolving every nearby object every frame. On Harbor Heat the query fell from 0.62-0.65 ms to 0.10 ms a frame (2.0-2.1 ms to 1.4 ms of simulation a frame).
- `objectStore.inBox` walks a coarse grid for big boxes instead of scanning every placed object; a 1 m cell lookup costs a string hash, so the switch happens past 32 cells rather than 4096.
