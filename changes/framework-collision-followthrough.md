### Fixed

- Scene entity `moveToward` and `moveTowardCommit` now stop at indexed world solids, matching player and walker collision without game-local blockers. Bare `SolidObstacleSource` adapters can inject the same bounded world-solid query.
