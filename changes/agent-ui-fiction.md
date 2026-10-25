### Added

- `GameFrame` (`@jgengine/react/gameFrame`): a panel or game button made of a material (`steel`, `brass`, `hull`, `wood`, `stone`, `paper`, `enamel`, `glass`, `carbon`, `leather`) with a cut silhouette (`chamfer`, `notch`, `slant`, `tab`, `banner`, `shield`, `ticket`, `torn`, `hex`, `box`), a rim, tint and glow. Textures are generated SVG noise and lighting, so no art files ship. `as="button"` lifts on hover, sinks on press, glows on keyboard focus and plays the engine UI sounds. `gameFrameVars()` dresses an element the game already owns.
- `GameCursor` (`@jgengine/react/gameCursor`): a brackets, chevron, bar, diamond or frame cursor that glides to the `useMenuNav` current item, then focus, then hover. Under reduced motion it jumps instead of gliding.
- `GameSlider` (`@jgengine/react/gameSlider`): a drawn slider (a groove with a knurled knob, or lit pips) with keyboard, drag and screen-reader support. Inside a menu, Up and Down still move between rows.
- `useGameFonts`, `loadGameFonts` and `gameFontStacks` (`@jgengine/react/gameFonts`): load a game's bundled display and body fonts and get CSS stacks with installed fallbacks.
- `HudFade` and `useHudAwake` (`@jgengine/react/hudFade`): a HUD group fades after a quiet spell, comes back when a watched value changes or on hover, and holds while urgent.
- `GameFramesPreview` fixture (`bun run shoot --fixture GameFramesPreview`): every material and cut, game buttons with each cursor, and both slider looks.

### Changed

- Settings slider rows draw a `GameSlider` instead of the browser's range input.
