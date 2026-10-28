fire/ fuel from plants and terrain, a fire view with flames, smoke and scorch, and a fire demo; the old weather fire grid is replaced by fire/

Closes #2741
Closes #2753

### Added

- fire/ fuel from the world: crown fuel read from grown plants, canopy stands rasterized onto the fire grid, ground fuel and elevation sampled from terrain, and per-cell sun exposure for fuel moisture
- FireLandscapeView draws a fire landscape: scorch, char and ash overlay, flame billboards sized by flame length, and smoke drifting downwind
- a fire demo in apps/dev (?game=fire, ?t= pins the time)
- `FireLandscapeView` (`@jgengine/core/fire/FireLandscape.draw`): Draw a {@link FireLandscape}: a ground overlay of flaming, smouldering, charred and ashen cells, flame billboards as tall as each cell's flame length, and smoke puffs rising from burning cells and drifting downwind. Also `FireLandscapeViewProps`.
- `plantCanopyFuel` (`@jgengine/core/fire/fuelSources`): Read a grown plant's crown fuel without changing it: foliage mass is its leaf area (from `PlantGrowth.stats().leafAreaM2`) over the species' specific leaf area; fine branchwood is the skeleton segments thinner than `fineWoodRadiusM` times the species' wood density. Also `FireGridFrame`, `PlantCanopyFuel`, `rasterizeCanopyFuel`, `sampleFireGround`, `sunExposure`.
- `FireLandscape.originX` and `originZ` expose where the grid sits.
- `FireLandscape.extinguish(col, row)` puts a burning cell out and keeps the fuel it had left.
- Fuel moisture models take `rainShare`: the share of rain each cell receives under shelter.
- Authored fire areas run on fire/: `AuthoredFireRuntime` (from `simulation.fire(id)`) has `ignite(x, z)` and `extinguish(x, z)`, authored weather rains on their fuel moisture and blows their wind, and the editor inspector picks their fuel model and moisture scenario.

### Fixed

- Wet fuel no longer catches when lit; a cell's fire only starts where its fuel can carry one.

### Removed

- `createFireGrid`, `FireGrid`, `FireGridConfig` and `FireGridTuning` (`@jgengine/core/weather/weather`): use `createFireLandscape` (`@jgengine/core/fire/fireLandscape`) with `createFuelMoistureModel`.
- `FireSpreadLayer` (`@jgengine/core/weather/FireSpreadLayer.draw`) and `@jgengine/core/weather/fireSpreadPose.draw`: use `FireLandscapeView` (`@jgengine/core/fire/FireLandscape.draw`).

### Migrate

- Authored fire areas: `position` is now the grid's corner, `config` keeps only `cols`, `rows` and `cellSize`, and `burnRate`, `spreadRate`, `wind` and `extinguishRate` are gone. Set `fuel` (a standard fuel model code such as `"GR2"`, or one code per cell), `moisture` (a `MOISTURE_SCENARIOS` code, default `"D2L2"`) and optionally `climate` (`airTemperatureC`, `relativeHumidity`).
