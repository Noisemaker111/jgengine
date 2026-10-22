### Migrate

- `createNearAgents` (`@jgengine/core/gameplay`) `snapshot()`/`restore()` now carry the crowd as well as the agents: `{ agents, crowd }` where `crowd` is a `NavCrowdSnapshot`. A restored near agent resumes the route it was walking instead of re-planning a fresh one, which is what makes an off-screen world round-trip tick-exactly.
- `OffScreenSnapshot.residents[].staleAt` is `number | null`; `null` is the "never goes stale" sentinel that was `Infinity`. `Infinity` does not survive JSON, so a saved off-screen world decayed a far, routine-less resident on every load.
- `TrafficSnapshot.counters` and `PoliceResponseState.counters` no longer carry `slowestTickMs`. A wall-clock timing sample is not state; it stays on `stats()` only, so a save document is byte-deterministic.

### Added

- `createGameSave` (`@jgengine/core/gameplay`) is the one game save document: a `version`, the game/time/playtime metadata a save menu shows, the world's shared RNG seed and cursor, and one section per registered system. Register each stateful system once (`name` + `snapshot()`/`restore()`, optional `reset()`); `capture()` builds the document, `save()`/`touch()` persist it through the same injected `SaveBackend` `createSaveStore` uses, `load()`/`switchSlot()` restore every section and the RNG cursor, and `migrate` upgrades an older payload. Autosave cadence is caller policy, and `digest()`/`digests()` hash the whole state (or one section) for a save/reload determinism test.
- `gameSaveDigest` (`@jgengine/core/gameplay`) hashes a `GameSaveDocument`'s state — every section, the clock and the RNG cursor — excluding the wall-clock `savedAt`.
