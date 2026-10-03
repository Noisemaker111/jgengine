### Added

- `planSolidRoute` (`@jgengine/core/nav/solidRoute`) plans bounded local routes over indexed movement collision boxes, with exact endpoints, caller-owned terrain policy and explicit no-path/budget results.
- `findPathResult` adds explicit grid search-budget results; grid edges and smoothing accept a caller traversal policy. Existing `findPath` callers retain their return contract.
