### Added

- `GameContext.state()` / `restore()` capture detached authoritative state without an offline save backend; hosted runners expose `state()` and `commit()`.
- Hosted sessions persist player identity and bounded command retry receipts alongside world state, expose `hasPlayer()` and `persistenceError()`, and accept stable operation ids.

### Fixed

- Hosted saves retain economy, clock, pose, progression, simulation and system save modules; client replication stays private. Legacy partial saves retain initialized missing modules.
- Hosted ticks advance game time. WS commands serialize per world, roll back registered state on rejection/failure, and acknowledge after persistence. Client operation ids avoid collisions between sessions.
- Async hosted saves and Node `flush()` / `close()` await storage. Convex queries project client state instead of exposing authoritative saves.

### Migrate

- Await hosted `save()` and Node `flush()` at persistence boundaries. Games can retire mirrored restore logic after migrating legacy saves; retain projections the UI reads. State never present in an old save cannot be reconstructed automatically.
