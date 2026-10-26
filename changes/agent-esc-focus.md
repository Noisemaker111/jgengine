Escape works again after closing a menu with the keyboard: in fernwild, Escape closed the pause menu and the next Escape did nothing until you clicked the game.

### Fixed

- Shell play-surface focus: a key that unmounts the focused control (Escape closing the pause menu) now returns focus to the play surface, the same way a click on an unmounting "Play" button already did. Every game gets it.

Root cause: gameplay keys are read on the shell's focusable wrapper. Closing the pause menu with Escape removed its focused button, Chromium dropped focus to `<body>` without a `focusout`, and the focus reclaim only watched clicks.

Verification:
- `bun test packages/shell/src/playSurfaceFocus.test.ts`: pass (new test fails without the fix)
- fernwild in the browser: New Game, Escape opens pause, Escape closes it, focus is back on the play surface, Escape opens pause again (before: focus stayed on `<body>` and pause did not reopen).

## Bends

- None.
