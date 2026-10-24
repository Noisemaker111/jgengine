### Added

- `GameMenu` and `GamePauseMenu` (`@jgengine/react/gameMenu`): a full-bleed menu surface over the live scene or drifting key art, with a token-sized logo, an animated navigable verb list, a generated selection tick and a detail pane per verb. The document scroll is locked while it is open, so the surface is exactly the viewport at any size.
- Panes for the detail slot: `ContinuePane`, `NewCharacterPane`, `SaveSlotsPane` (slot cards with a `meta.thumbnail`, playtime, progress, timestamp and a two-press delete) and `CreditsPane` (`@jgengine/react/gameMenuSaves`).
- `shrinkCapture` (`@jgengine/react/saveThumbnail`) turns a `captureCanvas` frame into a card-sized thumbnail data URL.

### Changed

- `switchSlot(slot, { flush: false })` (`@jgengine/core/game/gameSave`) loads a slot without first writing the live state over it. Opening a save from a menu uses it so Continue cannot overwrite the save it resumes.
- The dev runner's registry and environment modules import outside Vite, so a test or tool can read them.
