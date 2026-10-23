### Added

- `canvasCover` (`@jgengine/react/canvasCover`): one page-wide hold a covering surface takes, plus `useCanvasCover(declared)` for a React overlay. While it is held the shell stops drawing the world, its shadow passes and postfx; input, audio and the DOM HUD keep running, and the first frame after release draws the untouched scene. A scrim or side panel must not take it.
- `MenuScreen` and `TitleMenu` take `coversCanvas` (default false) to declare that the screen paints over the whole canvas. A menu with only a translucent scrim leaves the live scene drawing.
- The dev runner pins the cover with `?cover=1`, and the devtools agent bridge answers `canvas_cover`, so a perf run or `bun run drive` can measure a covered frame on any game.

### Changed

- The shell's frame loop switches to `frameloop="never"` under a cover instead of drawing a world nobody can see (measured on Brightway Park's pause menu: 1,095 whole-frame draws and 5.2 ms/frame before, 0 draws and 0.11 ms/frame covered). A frame-rate cap no longer advances a covered canvas.
