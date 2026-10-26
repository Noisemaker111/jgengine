### Migrate

- One pause menu: `GamePauseMenu` is now `PauseMenu` (`@jgengine/react/menu/pauseMenu`, also exported from `@jgengine/react`), the pause scale of `GameMenu`. The old `PauseMenu` in `@jgengine/react/modals` (Resume plus `{ id, label, onSelect, danger }` slots) is removed: pass `items: [{ id, label }]` and route them in `onSelect(id)`.
- `TitleMenu` (`@jgengine/react/titleMenu`) is removed; use `GameMenu` with `logo={{ text }}`.
- Menus live in one folder per layer. Update deep imports:
  - `@jgengine/react/{gameMenu,gameMenuSaves,gameMenuSound,menuNav,menuRouter,menuScreen,quickMenu,radialMenu}` → `@jgengine/react/menu/…`.
  - `@jgengine/core/ui/{menuNav,menuTransition,radialMenu}` → `@jgengine/core/menu/…`.
