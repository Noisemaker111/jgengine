Authored fire areas, the editor and the survival demo run on fire/; the cellular weather fire grid is deleted

Root cause: two fire systems existed engine-wide; authored scenes, the editor and the survival demo still used the old weather/ grid

Closes #2753

### Migrate

- Scenes saved with the cellular grid's fire-area config load as fuel-model areas: fuel 0 becomes NB1, any other amount GR2; burn, spread and rain-cooling rates are dropped
- A fire area is now `{ id, position, cols, rows, cellSize, fuels, fuel?, moisture?, airTemperatureC?, relativeHumidity?, seed?, ignitions? }`; `ctx.environment.fire(id)` returns a `FireLandscape`

### Added

- Authored fire areas burn on fire/ landscapes: standard fuel models per cell, fuel moisture that follows the weather's rain, cloud and temperature, and the weather's wind
- AuthoredScene draws authored fire areas with FireLandscapeView (AuthoredFires)
- The editor's fire-area inspector authors size, fuel model, moisture scenario, air temperature and humidity
- `AuthoredFires` (`@jgengine/core/fire/AuthoredFires.draw`): Draw the document's authored fire areas from the game's own authored simulation (`ctx.environment`), so what burns on screen is what gameplay reads. Also `AuthoredFiresProps`.

### Changed

- The survival demo burns a GR2 grass patch on fire/ instead of the cellular grid

### Fixed

- A fire landscape snapshot no longer carries its cache epoch, so a restored fire snapshots the same as one that never stopped

### Removed

- `@jgengine/core/weather/FireSpreadLayer.draw` no longer exports `FireSpreadLayer`, `FireSpreadLayerProps`; use `FireLandscapeView` from `@jgengine/core/fire/FireLandscape.draw`.
- `@jgengine/core/weather/weather` no longer exports `FireCell`, `FireCellState`, `FireGrid`, `FireGridConfig`, `FireGridTuning`, `FireStepOptions`, `createFireGrid`; use `createFireLandscape` from `@jgengine/core/fire/fireLandscape`.
- `@jgengine/core/world` no longer exports `FireGrid`, `createFireGrid`.
- `@jgengine/core/weather/fireSpreadPose.draw` is deleted.
