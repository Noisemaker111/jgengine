Runtime health: crash and telemetry seams, auto quality, per-game bundle budgets, and a faster 64-client host.

Part of #2837

### Added

- `defineGame({ health })` (`@jgengine/shell`) turns on crash reports, telemetry, auto quality and the game's own recoverable error screen. Each part is off unless the game sets it, and no vendor SDK is in the engine.
- `createCrashSeam`, `installCrashHandlers` and `scrubCrashText` (`@jgengine/core/health/crashSeam`) catch render, tick and async errors, window errors and unhandled rejections, and hand a scrubbed report with build, game, tier and the last N events to an injected `CrashReporter`.
- `createTelemetry` (`@jgengine/core/health/telemetrySink`) is a batched, bounded event queue in front of an injected `TelemetrySink`; with no sink it does nothing.
- `createAutoQuality` (`@jgengine/core/health/autoQuality`) picks a graphics tier from frame time with hysteresis, a cooldown and backoff, driven by an injected clock. A new Auto quality setting keeps the player's tier pick and every effect toggle.
- Per-game `bundleKb` budgets in each game's `perf-budget.json`, enforced and printed as a table by the site asset check.
- The load probe reports bytes allocated per tick under `BUN_JSC_useGC=false`.
- Drift Foundry turns on auto quality and its own error screen.

### Fixed

- A hosted world saves at most once a second by default in the node server (`saveIntervalMs`), the memory store no longer copies a snapshot twice, radius queries skip a dedupe set, and viewer interest and entity fingerprints allocate less. 64 clients by 2,000 entities: host 110-126 ms to 58-76 ms per tick on this container, 21.9 MB to 14.1 MB allocated per tick.
- Drift Foundry rebuilt its career, event and calendar snapshot on every call, several times per tick: a steady-state step falls from 442 KB to 40 KB allocated and from 0.60 ms to 0.09 ms.

### Migrate

- `createWorldGameServer` auto-saves once a second instead of every changed tick. Pass `saveIntervalMs: 0` to keep per-tick saves.
