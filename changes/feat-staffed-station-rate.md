### Added

- Resolve a bounded staffing snapshot into a production rate with `stationOutputRate` (`@jgengine/core/work/staffedStation`), using caller-owned stats, base output, per-stat scaling, and efficiency. The pure function composes with existing production and serializable game state.
