### Added

- UI kits (`@jgengine/react/uiKit`, `uiKitRoot`, `uiKits`): `defineGame({ uiKit: "ink" })` picks one of eight complete visual languages — `ink`, `paper`, `parchment`, `terminal`, `holo`, `broadcast`, `arcade`, `signal` — each with its own shapes, type, motion and UI cue sounds. Every kit ships the same seven parts (`KitButton`, `KitPanel`, `KitMeter`, `KitPrompt`, `KitToast`, `KitMenu`, `KitMinimapFrame`), so switching kits never breaks a game. `customizeKit(base, { tokens, components, css, motion, sounds })` reshapes one per game.
- With a kit, `GameMenu`/`GamePauseMenu` draw their verbs and detail pane in it, the shell's notice stack renders kit toasts, and the kit's cue sounds replace the default UI sounds (a game's `audio.uiCues` still wins).
- `KitActionPrompt` and `useInputDevice`/`actionGlyph` (`@jgengine/react/inputDevice`) show the bound key, pad button or a tap target for the device the player is using.
- `KitObjective`, `KitResultScreen` and `KitBanner` (`@jgengine/react/kitFlow`): the next-goal card with distance, direction, countdown warnings and an idle hint; a run/day result screen; a phase-change banner.
- `NoticeStack` `maxVisible` (default 3): older notices wait instead of piling up.
- Preview fixtures `UiKitsPreview` (all eight kits) and `UiKit-<name>`.
