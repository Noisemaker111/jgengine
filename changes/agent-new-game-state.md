a game declares its new-game start as data (defineGame newGame: cash, kit, unlocked items, prebuilt pieces, systems that start running). The engine builds every new game from that declaration only, refuses start items handed out anywhere else, and exposes it on the definition for checks to read

Engine seam: packages/core/src/game/defineGame.ts, packages/core/src/game/newGame.ts

### Added

- a game declares its new-game start as data (defineGame newGame: cash, kit, unlocked items, prebuilt pieces, systems that start running). The engine builds every new game from that declaration only, refuses start items handed out anywhere else, and exposes it on the definition for checks to read
- Fernwild declares its start: empty-handed, knowing only the Stone Pick and Torch engrams
- `NewGameConfig` (`@jgengine/core/game/newGame`): A game's new-game declaration, passed as `defineGame({ newGame })`: the {@link NewGameState} plus the hooks that apply its game-owned parts. Also `NewGameKit`, `NewGamePiece`, `NewGameState`.
