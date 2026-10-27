Every engine package (assets, convex, editor, github, jgengine, navbake, node, rapier, react, sql) now type-checks with the strict flags core, shell and ws already had. 400 errors fixed with guards and real types, no new casts.

### Added

- withField(row, key, value) in @jgengine/core/data/withField sets an optional field, or leaves it out when value is undefined, so a cleared field is never stored as key: undefined.
- `definedOnly` (`@jgengine/core/data/definedOnly`): `value` without its undefined fields, so `{ ...defaults, ...definedOnly(overrides) }` never erases a default with an explicit `undefined`, and a record built from optional inputs can be written where an optional field must be absent rather than `undefined`. Also `DefinedOnly`.
- `withField` (`@jgengine/core/data/withField`): A copy of `row` with the optional field `key` set to `value`, or left out when `value` is `undefined`. Also `OptionalKey`.

### Changed

- Every engine package (assets, convex, editor, github, jgengine, navbake, node, rapier, react, sql) now type-checks with the strict flags core, shell and ws already had. 400 errors fixed with guards and real types, no new casts.
- definedOnly in @jgengine/core/data/definedOnly is public, and its result keeps always-defined fields required; only fields that may be undefined become optional.

### Fixed

- Convex inserts and query results no longer write field: undefined for optional columns.
- the workspace catalog JSON scanner throws a clear error on truncated JSON instead of reading past the end.
