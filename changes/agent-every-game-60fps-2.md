the shader-ready check after load rides on the renderer's own draws instead of walking the whole visible scene before every render, so its cost follows what the camera draws, not the size of the world (Fernwild: 285 ms to 54 ms per 6 s)

### Added

- bun run perf <game> --profile also prints what allocates per second of play, the source of garbage collection pauses
- `SCENE_PROBE_REFRESH_MS` (`@jgengine/core/devtools/discover`): How often a probe that walks the whole scene walks it again; in between it answers its last reading.

### Fixed

- the shader-ready check after load rides on the renderer's own draws instead of walking the whole visible scene before every render, so its cost follows what the camera draws, not the size of the world (Fernwild: 285 ms to 54 ms per 6 s)
- dev probes that walk the scene (triangles, shadow casters, static batch draws) walk it at most every 2 s; every slow frame and every telemetry report used to walk it again, which made slow games slower in dev and in perf runs
- the HUD overflow check measures panels at most twice a second instead of on every style change, which forced a page layout each frame in a HUD that moves bars or markers
- perf and capture wait for a slow load to finish instead of giving up at 90 s while the shader warmup still had 30 s left (Ember Command on a GPU short of memory); a perf batch's deadline grows with its games
