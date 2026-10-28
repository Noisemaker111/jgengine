fire/ fuel from the world: crown fuel read from grown plants, canopy stands rasterized onto the fire grid, ground fuel and elevation sampled from terrain, and per-cell sun exposure for fuel moisture

Closes #2741

Root cause: two fire systems existed engine-wide; authored scenes, the editor and the survival demo still used the old weather/ grid

Closes #2753

### Migrate

- Scenes saved with the cellular grid's fire-area config load as fuel-model areas: fuel 0 becomes NB1, any other amount GR2; burn, spread and rain-cooling rates are dropped

### Added

- fire/ fuel from the world: crown fuel read from grown plants, canopy stands rasterized onto the fire grid, ground fuel and elevation sampled from terrain, and per-cell sun exposure for fuel moisture
- FireLandscapeView draws a fire landscape: scorch, char and ash overlay, flame billboards sized by flame length, and smoke drifting downwind
- a fire demo in apps/dev (?game=fire, ?t= pins the time)
- `FireLandscape.originX` and `originZ` expose where the grid sits.
- Authored fire areas burn on fire/ landscapes: standard fuel models per cell, fuel moisture that follows the weather's rain, cloud and temperature, and the weather's wind
- AuthoredScene draws authored fire areas with FireLandscapeView (AuthoredFires)
- The editor's fire-area inspector authors size, fuel model, moisture scenario, air temperature and humidity
- `AuthoredFires` (`@jgengine/core/fire/AuthoredFires.draw`): Draw the document's authored fire areas from the game's own authored simulation (`ctx.environment`), so what burns on screen is what gameplay reads. Also `AuthoredFiresProps`.
- `CANOPY_HEAT_KJ_KG` (`@jgengine/core/fire/crownFire`): Low heat of combustion of crown foliage, kJ/kg (8000 Btu/lb, as BehavePlus). Also `CanopyFuel`, `CrownFire`, `CrownFireType`, `activeCrownCriticalRate`, `assessCrownFire`, `canopyFuelLoad`, `crownFlameLength`, `crownInitiationIntensity` and 2 more.
- `decodeFireArray` (`@jgengine/core/fire/fireArrays`): Decode base64 from {@link encodeFireArray} into a typed array of the same byte length. Also `encodeFireArray`.
- `DEFAULT_FIRE_TUNING` (`@jgengine/core/fire/fireLandscape`): Defaults: 16-direction stencil, BehavePlus-default wind limit, crown fire and spotting on. Also `CanopyStand`, `FireBurnState`, `FireCellKind`, `FireCellReading`, `FireLandscape`, `FireLandscapeConfig`, `FireLandscapeSnapshot`, `FireLayers` and 5 more.
- `FireLandscapeView` (`@jgengine/core/fire/FireLandscape.draw`): Draw a {@link FireLandscape}: a ground overlay of flaming, smouldering, charred and ashen cells, flame billboards as tall as each cell's flame length, and smoke puffs rising from burning cells and drifting downwind. Also `FireLandscapeViewProps`.
- `DEFAULT_FUEL_MOISTURE_TUNING` (`@jgengine/core/fire/fuelMoisture`): NFDRS 1978 dead fuel lags and rain boundaries, NFDRS 2016 live fuel ranges. Also `FuelMoistureModel`, `FuelMoistureSnapshot`, `FuelMoistureTuning`, `MoistureWeather`, `createFuelMoistureModel`, `equilibriumMoistureContent`, `fuelLevelWeather`, `growingSeasonIndex` and 1 more.
- `plantCanopyFuel` (`@jgengine/core/fire/fuelSources`): Read a grown plant's crown fuel without changing it: foliage mass is its leaf area (from `PlantGrowth.stats().leafAreaM2`) over the species' specific leaf area; fine branchwood is the skeleton segments thinner than `fineWoodRadiusM` times the species' wood density. Also `FireGridFrame`, `PlantCanopyFuel`, `rasterizeCanopyFuel`, `sampleFireGround`, `sunExposure`.
- `emberIgnitionProbability` (`@jgengine/core/fire/spotting`): Probability that a firebrand landing in fine dead fuel starts a fire (Schroeder 1969, in the NFDRS form of Cohen & Deeming 1985): from 1-h fuel moisture and the fuel's temperature, 0..1. Also `SpotDistance`, `SpotTerrain`, `TorchingSpecies`, `surfaceFireSpotDistance`, `torchingTreeSpotDistance`.

### Changed

- The survival demo burns a GR2 grass patch on fire/ instead of the cellular grid

### Fixed

- A fire landscape snapshot no longer carries its cache epoch, so a restored fire snapshots the same as one that never stopped

### Removed

- createFireGrid, FireGrid, FireCell, FireCellState, FireGridConfig, FireGridTuning, FireStepOptions, FireSpreadLayer and fireSpreadPose; use @jgengine/core/fire
- `@jgengine/core/landform/dunes/duneField` no longer exports `DEFAULT_DUNE_PARAMS`, `DuneField`, `DuneFieldOptions`, `DuneGrid`, `DuneInitial`, `DuneParams`, `DuneSnapshot`, `WindMode` and 2 more.
- `@jgengine/core/landform/materials/landformSurface` no longer exports `LANDFORM_SURFACE_KINDS`, `LandformSurface`, `LandformSurfaceKind`, `LandformSurfaceOptions`, `landformSurface`.
- `@jgengine/core/landform/materials/sedimentCover` no longer exports `COVER_CLASSES`, `CoverClass`, `DEFAULT_GRAIN_SIZES`, `DEFAULT_ROCK_YIELD`, `GRAIN_CLASSES`, `GrainClass`, `GrainMix`, `GrainSizes` and 4 more.
- `@jgengine/core/physics/reference/boatComparison` no longer exports `ManoeuvringSubject`, `kvlcc2Subject`.
- `@jgengine/core/physics/reference/shipManoeuvring` no longer exports `KVLCC2_L7`, `KVLCC2_L7_PUBLISHED`, `KVLCC2_L7_SPEED`, `ManoeuvringTrialBoat`, `MmgForces`, `MmgHullDerivatives`, `MmgPropeller`, `MmgRudder` and 11 more.
- `@jgengine/core/weather/FireSpreadLayer.draw` no longer exports `FireSpreadLayer`, `FireSpreadLayerProps`.
- `@jgengine/core/weather/weather` no longer exports `FireCell`, `FireCellState`, `FireGrid`, `FireGridConfig`, `FireGridTuning`, `FireStepOptions`, `createFireGrid`.
- `@jgengine/core/world` no longer exports `FireGrid`, `createFireGrid`.
