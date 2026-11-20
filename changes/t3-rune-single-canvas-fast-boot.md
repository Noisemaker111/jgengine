Every Rune screen on a page (loading cover, shader warm-up, game UI) draws as a layer on one shared wasm instance and one GPU canvas, and Rune's first frame shows about twice as fast (878 ms to 414 ms in a production build)

Engine seam: packages/core/src/boot/bootScreen.view.tsx, packages/core/src/ui/jsx/pageHost.view.ts, packages/core/src/ui/rune/nativeSurface.view.ts, packages/core/src/ui/runeUi.view.ts

### Added

- `addRuneFonts` (`@jgengine/core/ui/runeUi.view`): Register additional font URLs on any live Rune host so late-registered game fonts load dynamically.

### Changed

- Every Rune screen on a page (loading cover, shader warm-up, game UI) draws as a layer on one shared wasm instance and one GPU canvas, and Rune's first frame shows about twice as fast (878 ms to 414 ms in a production build)
