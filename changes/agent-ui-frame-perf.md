### Changed

- `GameFrame` draws its rim, cast shadow and glow as clipped plates under the face instead of CSS `filter: drop-shadow(…)`. Over a live 3D scene a filtered element is re-rendered every frame: Odd Orbit's 16 HUD frames at 1600x900 ran at 16–17 fps with the old filter rims and 60 fps with plates. The rim looks the same, and the soft cast shadow is now a hard plate 4px below the frame. `gameFrameVars()` now sets `--jg-gf-rim`, `--jg-gf-rim-w`, `--jg-gf-face-cut` and `--jg-gf-glow`, and hand-dressed elements add `data-shadow` or `data-glow` for the shadow or glow plate.
- Hover, press, focus and disabled on game buttons light or dim the face with an overlay instead of `brightness()` and `grayscale()` filters.
- The paper and arcade UI kits, `GameCursor`, `GameSlider`, the game menu, the save list, `ActionHud`, `SelectionHud`, notices, `HudFrame`, the interaction prompt, the map, `MenuScreen`'s `blur` scrim, waypoint markers and the modal backdrop no longer use `filter` or `backdrop-filter`. Panels that had a backdrop blur use a denser fill so text stays readable.

### Added

- A guard test (`hudNoFilters.test.ts`) fails if a UI kit, a game-UI block or an engine HUD primitive uses `filter` or `backdrop-filter`.
