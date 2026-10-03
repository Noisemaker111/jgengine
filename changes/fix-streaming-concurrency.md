### Migrate

- Explicit `StreamingSettings` objects need `maxConcurrentLoads` (default 4). Cancelled loads keep a concurrency slot until settlement; loaders must settle after cancellation and an `unload` hook releases stale successful loads.

### Added

- Asset streaming `retune` merges streaming policy; setting concurrency to zero pauses new loads.

### Fixed

- Streaming bounds outstanding loads across frames, cancellation, clear, and same-id retries. Clear releases resident resources, and stale completions cannot overwrite new demand.
