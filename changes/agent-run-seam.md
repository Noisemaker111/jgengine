### Added

- `createRunLoop` (`@jgengine/core/run/runLoop`) holds a run's at-risk haul, banks it scaled by the line or loses it on a failure, and draws one authored change for each next run from a seeded table, so the same seed and run history replay the same sequence. State round-trips through `snapshot`/`restore`; the money stays in `progression/careerBank`.
