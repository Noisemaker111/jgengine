A key moved in Settings takes effect in play: the game itself keeps the player's rebinds

Engine seam: packages/core/src/game/controlGate.ts, packages/core/src/game/gameFlow.ts, packages/core/src/gameplay.ts, packages/core/src/input/bindingOverrides.ts, packages/core/src/play/headlessKeys.draw.ts, packages/shell/src/GamePlayerShell.tsx

### Added

- `bindingOverrides` (`@jgengine/core/game/controlGate`): The player's rebinds in this game context: action to the codes that now drive it. Also `rebindAction`, `reboundActionCodes`, `setBindingOverrides`.
- `saveBindingOverrides` (`@jgengine/core/gameplay`): Store a game's whole rebind map (an empty one clears it), as the shell does whenever the game's rebinds change.
- `saveBindingOverrides` (`@jgengine/core/input/bindingOverrides`): Store a game's whole rebind map (an empty one clears it), as the shell does whenever the game's rebinds change.

### Changed

- A key moved in Settings takes effect in play: the game itself keeps the player's rebinds
