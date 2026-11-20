The loading screen draws on Rune; window.__jg.loading tells tools when a page is loading

Engine seam: packages/core/src/boot/bootScreen.view.tsx, packages/core/src/boot/loadingCover.ts, packages/core/src/scene/SceneWarmupGate.draw.tsx, packages/core/src/ui/rune/element.ts, packages/core/src/ui/rune/nativeSurface.view.ts, packages/core/src/ui/rune/primitives.view.tsx, packages/jgengine/src/templates/driveSteps.ts, packages/jgengine/src/templates/gameFiles.ts and 1 more

### Migrate

- data-shell-code-loading and data-shell-warmup are gone; read window.__jg.loading. A Rune root takes layer to stack above or below a game's UI

### Added

- `loadingCovered` (`@jgengine/core/boot/loadingCover`): Whether any loading cover is up on this page. Also `LoadingCoverReading`, `showLoadingCover`.

### Changed

- The loading screen draws on Rune; window.__jg.loading tells tools when a page is loading

### Fixed

- drive tools find Rune controls on every surface, not only the last one mounted
