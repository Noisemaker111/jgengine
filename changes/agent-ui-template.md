### Added

- `createGameFlowSystem` (`@jgengine/core/game/gameFlow`): title, play, pause and autosave checkpoints as one system, with the `pause` and `start` commands. `openTitle`, `playGame`, `newGame`, `continueGame`, `togglePause` and `saveNow` drive it from menus and result screens.
- `GameFlowUI` (`@jgengine/react/menu/gameFlowMenus`): the title menu, the HUD while playing and the pause menu over it. The game passes its HUD and its menu words (`name`, `tagline`, `pitch`, `accent`, `controls`, `briefing`, `credits`). `startNewGame` starts a fresh run in a browser page, reloading when a run already played.

### Changed

- The nine games that carried identical `flow.ts` and `Menus.tsx` copies now use `createGameFlowSystem` and `GameFlowUI`.
