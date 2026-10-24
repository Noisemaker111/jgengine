### Migrate

- `scene.entity.spawn` now defaults `onExisting` to `"keep"`: spawning a live id adopts the body already there and returns its id, instead of throwing. A re-stream, a restore or a far teleport can no longer make a second body for one resident. Pass `onExisting: "throw"` where a duplicate is a bug, or `"replace"` to respawn fresh.

### Added

- `createPerception` (`@jgengine/core/world`) takes `solids` — the world collision set, normally `ctx.world.solids` — and a sighting then needs a clear line against it, so an agent no longer sees a target through a building. `maxSightRaysPerPass` (default 64) bounds the wall tests one agent's tick may spend; a pair the budget leaves unchecked is not sighted, and `PerceptionStats.occlusionDropped` counts those. Omitting `solids` keeps the cheap cone.
- `sightLineBlocked(solids, from, to)` (`@jgengine/core/world`) is the standalone "is anything solid between these two points" test those rays use.
