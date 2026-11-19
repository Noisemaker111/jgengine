a save the browser or server refused reports failed and posts "Save failed", never "saved"; Scrap Signal and Harbor Heat get the same guarantee as every other game

Engine seam: packages/convex/src/convexSaveBackend.ts, packages/core/src/game/gameFlow.ts, packages/core/src/game/keyValueStore.ts, packages/core/src/menu/gameFlowMenus.view.tsx, packages/core/src/mission/sideJobs.ts, packages/core/src/run/sessionLoop.ts, packages/core/src/runtime/gameContext.ts, packages/core/src/runtime/hostPersistence.ts and 11 more

### Migrate

- save(), load(), switchSlot() and peek() on save stores, game saves and ctx.game.save return what happened ({ kind: saved | failed } and { kind: loaded | empty | corrupt | failed }); hasSave() is peek(slot()).kind === "loaded"
- SaveBackend gains keys(prefix); localSaveBackend takes a storage with length and key(i) and has no errorMode; createKeyValueStore throws on failure; Convex save functions need a saves.keys query
- HostPersistence.savePlan is required and saveProfile, saveChunks, deleteChunks and applyLeaderboardIncrements are gone from it

### Added

- saveBackendContract, the checks every save backend passes (local, memory, Convex, Deepward, Odd Orbit run it)
- `continueHint` (`@jgengine/core/game/gameFlow`): The Continue hint for each {@link SaveSlotState}, so a damaged save is never shown as no save. Also `SaveSlotState`, `readSaveSlotState`.
- `saveBackendContract` (`@jgengine/core/save/saveBackendContract`): The checks every {@link SaveBackend} passes, run against the save store a game uses: a refused write never reads as saved, a refused read is not an empty slot, damaged bytes are kept, two stores on one backend never drop each other's slot, and a slot switch never discards unsaved progress. Also `SaveBackendCheck`, `SaveBackendHarness`, `storageHarness`.
- `damagedSaveKey` (`@jgengine/core/save/saveStore`): The backend key a damaged payload is copied to before the slot can be written again. Also `LoadResult`, `PeekResult`, `SaveResult`, `SaveStorage`.

### Fixed

- a save the browser or server refused reports failed and posts "Save failed", never "saved"; Scrap Signal and Harbor Heat get the same guarantee as every other game
- a damaged save loads as corrupt, its bytes are copied aside before anything can overwrite them, and the title screen says the save was damaged instead of offering a new game as if there were none
- switching save slot after a failed write, or to a slot that cannot be read, stays on the old slot with its progress
- two tabs or two stores on one backend can no longer drop each other's slot from the slot list
- a host flush that fails part-way never adds leaderboard points twice when it retries; the file backend writes each flush all or nothing
- a damaged editor scene file errors instead of opening as an empty scene, and a draft that fails to restore is kept

### Removed

- `@jgengine/core/game/keyValueStore` no longer exports `KeyValueStorageErrorPolicy`, `KeyValueStorageFailure`.
- `@jgengine/core/save/snapshotSave` no longer exports `RuntimeSaveSlot`.
