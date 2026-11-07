Harbor Heat's chart stops re-rendering every frame; it pans, turns and places its markers through MinimapChrome's new place handle

Engine seam: packages/core/src/instancing/staticDrawPool.draw.ts, packages/core/src/map/map.view.tsx, packages/react/src/hooks.ts, packages/react/src/selectSnapshot.ts

### Added

- useGameStoreLive re-renders a HUD only when what it draws changes and writes per-frame values through refs
- `MinimapChromeHandle` (`@jgengine/core/map/map.view`): Moves an already-drawn `MinimapChrome`'s markers in place.
- `useGameStoreLive` (`@jgengine/react`): Select from the game store at two speeds. Also `MinimapChromeHandle`.
- `useGameStoreLive` (`@jgengine/react/hooks`): Select from the game store at two speeds.

### Fixed

- Harbor Heat's chart stops re-rendering every frame; it pans, turns and places its markers through MinimapChrome's new place handle
- static prop batches with the same material share one material copy across cells, so the main pass stops re-uploading the same uniforms at each cell's batch
