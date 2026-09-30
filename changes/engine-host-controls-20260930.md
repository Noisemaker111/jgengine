### Migrate

- Await `useGame().commands.run(...)` when showing command results: authoritative shells now wait for host acknowledgement; offline calls remain synchronous. Trusted host execution stays on `ctx.game.commands.run` / `runAs`.
- Remove manual `ctx.time.advance` inside `ctx.sim.advance` callbacks. Simulation advances it once and supplies scaled gameplay time as the callback's third argument; prediction opts out with `{ advanceTime: false }`.

### Fixed

- Hosted HUD controls, registered target commands and per-actor input queues route to the authoritative host without mutating replicas before join.
- Hosted clock snapshots reach client clock hooks; prediction never advances authoritative gameplay time.
- Remote player and possessed-pawn deaths credit the resolved killer for XP commands, quests and loot.

### Added

- `bindCommandTransport` / `dispatchCommand` provide the shared UI command boundary; `possession.ownerOf` resolves unique recorded ownership.
- A source-owned anonymous authority fixture reports separate compiled frontend and realm revisions and preserves throwaway progress through reload.
