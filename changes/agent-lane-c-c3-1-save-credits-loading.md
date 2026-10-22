### Added

- `credits-panel` — `CreditsPanel` (`@jgengine/react/creditsPanel`): a scrollable, HudTheme-skinned credits screen over the scene with one back affordance reachable by keyboard, gamepad and pointer.
- Loading screen with tips — `LoadingScreen` (`@jgengine/react/loadingScreen`): progress bar (real 0–1 value or indeterminate), rotating tips, a ready gate any key / A / click accepts, reduced-motion aware, and a scene backdrop.
- `createTipRotation` (`@jgengine/core/ui/loadingTips`): deterministic, seeded tip order that cycles every tip once, with `snapshot`/`restore`.
- Save slots wired to the save document — `refreshSaveSlots`, `saveSlotMeta`, `formatSavePlaytime` and `gameSaveSlotSource` (`@jgengine/core/game/saveSlotIndex`) read the slots a `createGameSave` actually wrote and fill a `createSaveSlots` index with the name, saved time and playtime chip a save-select menu shows.
- `SaveStore.peek(slot)` and `GameSave.peek(slot)`: read a slot's stored document without touching the live session, applying sections or changing status.
- `SaveSlotWrite.savedAt`: a save payload that knows when it was written can stamp that time instead of the index's clock.
