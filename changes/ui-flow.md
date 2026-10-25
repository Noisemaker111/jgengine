### Added

- UI kits (`@jgengine/react/uiKit`, `uiKitRoot`, `uiKits`): `defineGame({ uiKit: "ink" })` picks one of eight complete visual languages — `ink`, `paper`, `parchment`, `terminal`, `holo`, `broadcast`, `arcade`, `signal` — each with its own shapes, type, motion and UI cue sounds. Every kit ships the same seven parts (`KitButton`, `KitPanel`, `KitMeter`, `KitPrompt`, `KitToast`, `KitMenu`, `KitMinimapFrame`), so switching kits never breaks a game. `customizeKit(base, { tokens, components, css, motion, sounds })` reshapes one per game.
- With a kit, `GameMenu`/`GamePauseMenu` draw their verbs and detail pane in it, the engine settings, saves and credits panes take the kit's colours and type, the shell's notice stack renders kit toasts, and the kit's cue sounds replace the default UI sounds (a game's `audio.uiCues` still wins).
- `KitActionPrompt`, `useActionGlyph` and `useInputDevice`/`actionGlyph` (`@jgengine/react/inputDevice`) show the bound key, pad button or a tap target for the device the player is using.
- `KitObjective`, `KitResultScreen` and `KitBanner` (`@jgengine/react/kitFlow`): the next-goal card with distance, a direction arrow, countdown warnings and an idle hint; a run/day result screen; a phase-change banner.
- `NoticeStack` `maxVisible` (default 3): older notices wait instead of piling up.
- Preview fixtures `UiKitsPreview` (all eight kits), `UiKit-<name>` and `UiKitMenu-<name>` (a kit's pause menu with the engine settings pane).

### Changed

- `GameMenu` stacks its verbs above the detail pane on a portrait phone instead of squeezing two columns.

### Fixed

- Clicking a HUD button with the mouse or a finger no longer leaves it focused, so gameplay keys (pause, movement, hotkeys) keep working after the click. Dialogs, menus and forms keep their focus.
