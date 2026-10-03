### Migrate

- Scene rays require finite origins, direction magnitudes and nonnegative finite `maxDistance`; invalid rays throw `RangeError`. Bound each caller's range instead of passing `Infinity`. World-solid cell sizes must be finite and positive.

### Added

- `createWorldSolids` supplies optional `inRay` candidates through crossed hash-grid cells, preserving live layers and oversized blockers. Sparse or unrepresentable traversals fall back to cached AABB ray tests without dropping geometry. Optional caller-owned work counters expose cell, entry and bounds costs. Scene queries use it automatically; `inBox`-only adapters remain compatible.
