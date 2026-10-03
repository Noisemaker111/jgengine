### Added

- Authored weather profiles, absolute schedules, transitions and local wind zones share one renderer-free sample with gameplay and precipitation.
- Persistent bounded surface wetness, snow, heat and exposure support snapshots, restoration, retuning and injected storage.
- Weather rendering consumes simulation time, clips particles against the nearest 32 authored shelters and supports bounded ground ripple pools.

### Fixed

- Shared precipitation uniforms preserve per-layer wind when the provider has no wind configured.
- Fire grids restore fuel/heat state, retune live wind/rates and reuse a bounded heat workspace; fire animation supports simulation time.
- Lightning animation supports authoritative start/time values and seeded flicker for pause and replay.

- Authored runtime state shares the fixed game clock, preserves fire/flock poses on retunes, restores atomically, and publishes explicit appearance signals without renderer ownership.
- Games select force targets through `installEnvironmentMotion`; caps and masks are game policy, and paused simulation does not queue forces.
- Fire tools and opted-in rain cooling extinguish burning cells while preserving fuel; authored fire bindings stop spawning when the area stops burning.
- Typed `get_simulation` / `set_simulation` authoring persists weather, schedules, wind zones, emitters, fields, fire areas and habitats through ordinary undo, save and import/export.
- Reject numerically unsafe force magnitudes and wind coupling before authority or caller buffers mutate.
- Forward game-selected visible path kinds so flock/patrol guide routes need not draw as ground roads.
