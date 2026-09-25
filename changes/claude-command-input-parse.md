### Added

- `CommandDef.parse` and `defineCommand` (`@jgengine/core/runtime/commandRunner`). `parse` turns the untrusted wire value into typed input once. The runner refuses a `null` result with `MALFORMED_COMMAND_INPUT_REASON` before `scope`, `validate` or `apply` run, so those stages only see parsed input.
- Bounded input readers in `@jgengine/core/runtime/commandInput`: `readInputNumber` (always finite, optional range and integer), `readInputString`, `readInputOneOf`, `readInputPoint2`, `readInputPoint3`, `readInputArray` and `isInputRecord`.
