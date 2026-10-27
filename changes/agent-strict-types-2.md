Every engine package (assets, convex, editor, github, jgengine, navbake, node, rapier, react, sql) now type-checks with the strict flags core, shell and ws already had: noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noPropertyAccessFromIndexSignature and noImplicitReturns. 400 errors fixed with guards and real types, no new casts.

### Added

- `withField(row, key, value)` (`@jgengine/core/data/withField`) sets an optional field, or leaves it out when `value` is `undefined`, so a cleared field is never stored as `key: undefined`.

### Changed

- `definedOnly` (`@jgengine/core/data/definedOnly`) is public, and its result keeps always-defined fields required; only fields that may be `undefined` become optional.
- Optional props on kit, menu, preview and editor bridge types accept an explicit `undefined`.

### Fixed

- Convex inserts and query results no longer write `field: undefined` for optional columns.
- The workspace catalog JSON scanner throws a clear error on truncated JSON instead of reading past the end.
