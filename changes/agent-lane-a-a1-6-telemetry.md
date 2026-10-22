### Added

- `createLogBus` (`@jgengine/core/devtools/logBus`): a fixed-capacity ring of log lines tagged by owning system, with a separate ring for warnings and errors so a crash line is never pushed out by info traffic. `devtools.logs` now writes through it (`write(level, system, message)`, `snapshot()`, `counts()`, `dropped()`); `DevtoolsLogEntry` gained `system`.
- `devtools.probes.registerSystem(id, { counters, timers, state })`: a system reports its own counters, named timings and one state line in a few lines, with no shell wiring. Readings surface as `systems` in `devtools.snapshot()`, in `debug_snapshot`, and in every perf record.
- `PerfReport` (`@jgengine/core/devtools/report`): the one perf record shape shared by `bun run perf` and the in-page report.
- The shell samples frame telemetry in-page in dev builds: `window.__JG.report()` returns that record, and the page pushes it about once a second to the dev server's `GET/POST /__jgengine/report` route. `bun run debug <game>` prints the record of a game already open and exits non-zero on a budget breach in `scripts/perf-budget.json`.
