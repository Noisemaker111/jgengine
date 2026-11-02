Harbor Heat streams its city by 128 m block, and its residents walk a tiled nav mesh streamed around the player.

Part of #2837

Root cause: the world scene's renderSingle read its candidate with a non-null assertion, but a batch's fallback members can outlive an object removed since the render gathered candidates.

### Migrate

- `createWorldStreamer`, `shardDistance` and their types move from `@jgengine/core/editor` to `@jgengine/core/visibility/streamer`. `StreamUpdate` no longer carries `resident`; call `streamer.resident()`.

### Added

- `createWorldStreamer` follows every focus point (every player), with hysteresis, per-update load and unload budgets, a loading state held until `markReady`, `retune`, and `snapshot`/`restore`. `gridShards` and `gridCellId` make streamed grid cells.
- `createCellContent` (`@jgengine/core/visibility/cellContent`), with `sceneObjectCells` and `sceneEntityCells`: bodies and entities in an unloaded cell keep simulating, freeze, or despawn with a saved record, by the rule the game picks, and come back a few per tick.
- `createCellStreaming` and `bindCellStreaming` (`@jgengine/core/visibility/cellStreaming`): cells load and unload around every player within budgets, and model files are fetched before a cell's content comes back. The renderer keeps an away cell's far proxy, parks a leaving cell once its proxy is built, and warms cells it has never seen.
- `createNavTiles` and `navTileFromGrid` (`@jgengine/core/nav/navTiles`): a nav mesh built and stored per tile, rebuilt only where a region changed, streamed around focus points, and stitched into one `NavRuntime` so paths cross tile borders.
- `ObjectStore.retain` keeps parked props in `snapshot()`, so a save written while a cell is away still holds them.
- The agent bridge's `scene_counts` verb reports resident entities and objects.

### Fixed

- A world scene batch that still holds a removed object draws nothing instead of crashing the scene.
