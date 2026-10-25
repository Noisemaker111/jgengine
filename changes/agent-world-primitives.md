### Added

- World model primitives for every genre:
  - `kinds` are things placed at runtime (towers, rides, racks), with costs, build times, limits and refunds.
  - `slots` and `grids` hold placements with footprints.
  - `actions` (upgrade, repair, train, sell) have costs that can be refused and scale by a target fact.
  - `totals` sum, count or take the max across subjects.
  - `flows` are per-second streams like income and upkeep.
  - `queues` time work on the engine work queue.
  - Refusals say what was short ("Upgrade needs 60 more gold").
- `@jgengine/core/worldModel/gameSpec`: `defineGameSpec` turns a whole game declaration into an installable system. Its world is one store, so saves and co-op sync come with it. It provides `<id>.place/remove/act/cancel/job.start` commands that refuse with reasons, `onReady`/`onRemoved`/`onLanded` callbacks to put builds on screen, and named code hooks for anything a declaration can't say (#2413).
