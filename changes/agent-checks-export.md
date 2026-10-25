### Changed

- Drive step files refuse `ms` outside a `key` step and `timeoutMs` outside `waitFor`; the runner ignored both, so a flow carrying one looked like it waited and did not. Move a cap into `before` / `after { "timeoutMs": n }`. An error inside an included flow now starts with that flow's file.

### Added

- `jgengine/gameShape` exports `moduleGlobalName(line)` and `isGameSourceFile(name)`, the module-global rule (#1579) the engine and game repos' gates share.
