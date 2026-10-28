fire/ fuel moisture over time from weather: NFDRS 1978 dead fuel time lags, sun and rain, Jolly 2005 live green-up, as a fire moisture field

Closes #2741

### Added

- fire/ fuel moisture over time from weather: NFDRS 1978 dead fuel time lags, sun and rain, Jolly 2005 live green-up, as a fire moisture field
- fire/ fuel from the world: crown fuel read from grown plants, canopy stands rasterized onto the fire grid, ground fuel and elevation sampled from terrain, and per-cell sun exposure for fuel moisture
- FireLandscapeView draws a fire landscape: scorch, char and ash overlay, flame billboards sized by flame length, and smoke drifting downwind
- a fire demo in apps/dev (?game=fire, ?t= pins the time)
- `CANOPY_HEAT_KJ_KG` (`@jgengine/core/fire/crownFire`): Low heat of combustion of crown foliage, kJ/kg (8000 Btu/lb, as BehavePlus). Also `CanopyFuel`, `CrownFire`, `CrownFireType`, `activeCrownCriticalRate`, `assessCrownFire`, `canopyFuelLoad`, `crownFlameLength`, `crownInitiationIntensity` and 2 more.
- `decodeFireArray` (`@jgengine/core/fire/fireArrays`): Decode base64 from {@link encodeFireArray} into a typed array of the same byte length. Also `encodeFireArray`.
- `DEFAULT_FIRE_TUNING` (`@jgengine/core/fire/fireLandscape`): Defaults: 16-direction stencil, BehavePlus-default wind limit, crown fire and spotting on. Also `CanopyStand`, `FireBurnState`, `FireCellKind`, `FireCellReading`, `FireLandscape`, `FireLandscapeConfig`, `FireLandscapeSnapshot`, `FireLayers` and 5 more.
- `FireLandscapeView` (`@jgengine/core/fire/FireLandscape.draw`): Draw a {@link FireLandscape}: a ground overlay of flaming, smouldering, charred and ashen cells, flame billboards as tall as each cell's flame length, and smoke puffs rising from burning cells and drifting downwind. Also `FireLandscapeViewProps`.
- `ANDERSON_FUEL_MODELS` (`@jgengine/core/fire/fuelModels`): The original 13 fuel models (Anderson 1982; Albini 1976), keyed by code `FM1`..`FM13`. Also `FuelLoads`, `FuelModel`, `FuelMoisture`, `KG_M2_PER_LB_FT2`, `KG_M2_PER_TON_ACRE`, `KJ_KG_PER_BTU_LB`, `MOISTURE_SCENARIOS`, `M_PER_FT` and 4 more.
- `DEFAULT_FUEL_MOISTURE_TUNING` (`@jgengine/core/fire/fuelMoisture`): NFDRS 1978 dead fuel lags and rain boundaries, NFDRS 2016 live fuel ranges. Also `FuelMoistureModel`, `FuelMoistureSnapshot`, `FuelMoistureTuning`, `MoistureWeather`, `createFuelMoistureModel`, `equilibriumMoistureContent`, `fuelLevelWeather`, `growingSeasonIndex` and 1 more.
- `plantCanopyFuel` (`@jgengine/core/fire/fuelSources`): Read a grown plant's crown fuel without changing it: foliage mass is its leaf area (from `PlantGrowth.stats().leafAreaM2`) over the species' specific leaf area; fine branchwood is the skeleton segments thinner than `fineWoodRadiusM` times the species' wood density. Also `FireGridFrame`, `PlantCanopyFuel`, `rasterizeCanopyFuel`, `sampleFireGround`, `sunExposure`.
- `emberIgnitionProbability` (`@jgengine/core/fire/spotting`): Probability that a firebrand landing in fine dead fuel starts a fire (Schroeder 1969, in the NFDRS form of Cohen & Deeming 1985): from 1-h fuel moisture and the fuel's temperature, 0..1. Also `SpotDistance`, `SpotTerrain`, `TorchingSpecies`, `surfaceFireSpotDistance`, `torchingTreeSpotDistance`.
- `KW_M_PER_BTU_FT_S` (`@jgengine/core/fire/surfaceFire`): kW/m per Btu/ft/s. Also `MPS_PER_MPH`, `SpreadConditions`, `SurfaceFuelbed`, `SurfaceSpread`, `WindLimit`, `curedHerbFraction`, `ellipseEccentricity`, `firelineIntensity` and 8 more.
- `twentyFootWind` (`@jgengine/core/fire/windAdjustment`): 20-ft wind from a 10-m wind: divide by 1.15 (Turner & Lawson 1978, as in BehavePlus). Also `CanopyShelter`, `windAdjustmentFactor`.

### Changed

- Part of #2741

### Removed

- `@jgengine/core/landform/evolution/landscapeEvolution` no longer exports `DEFAULT_LANDFORM_PARAMS`, `LandformFields`, `LandformInitial`, `LandformParams`, `LandformSnapshot`, `LandformStepReport`, `LandscapeEvolution`, `LandscapeEvolutionOptions` and 2 more.
- `@jgengine/core/landform/evolution/rockStrata` no longer exports `LandformStrata`, `RockLayer`, `UNIFORM_ROCK`.
- `@jgengine/core/landform/flow/dInfinity` no longer exports `dInfinityArea`.
- `@jgengine/core/landform/flow/flowRouting` no longer exports `FLAT_RISE`, `FlowRouting`.
- `@jgengine/core/landform/grid/landformGrid` no longer exports `D8_DCOL`, `D8_DROW`, `LANDFORM_MAX_SIDE`, `LandformEdge`, `LandformGrid`.
- `@jgengine/core/landform/validation/geomorphicLaws` no longer exports `ChannelSelection`, `PowerLawFit`, `fitPowerLaw`, `hackLawFit`, `slopeAreaFit`, `upstreamLength`.
- `@jgengine/core/physics/reference/boatComparison` no longer exports `BoatComparisonSubject`, `ReferenceBoat`, `compareBoat`, `holtropExampleSubject`, `referenceBoatSubjects`, `referenceSubjectFor`, `speedboatSubject`, `surgeAddedMass`.
- `@jgengine/core/physics/reference/hullForm` no longer exports `HullMesh`, `HullOffsets`, `PrismaticPlaningHullOptions`, `WigleyHullOptions`, `boxBarge`, `hullMeshFromOffsets`, `meshVolume`, `prismaticPlaningHull` and 1 more.
- `@jgengine/core/physics/reference/hullHydrostatics` no longer exports `FloatingAttitude`, `FloatingCondition`, `HullIntegrator`, `HullLoads`, `HullWater`, `HydrostaticParticulars`, `MARINE_GRAVITY`, `RightingArmPoint` and 10 more.
- `@jgengine/core/physics/reference/marinePropeller` no longer exports `BSeriesPropeller`, `OpenWaterPoint`, `PropellerOperatingPoint`, `ScrewBladeSection`, `Waterjet`, `WaterjetPoint`, `bSeriesBladeSection`, `bSeriesOpenWater` and 5 more.
- `@jgengine/core/physics/reference/planingHull` no longer exports `NACA_TN2876_MODEL`, `NACA_TN2876_RUNS`, `PlaningEquilibrium`, `PlaningFluid`, `PlaningHull`, `PlaningState`, `PrismaticPlaningRun`, `planingAtTrim` and 4 more.
- `@jgengine/core/physics/reference/shipResistance` no longer exports `HOLTROP_MENNEN_EXAMPLE`, `HoltropConditions`, `HoltropHull`, `HoltropPropeller`, `HoltropPropulsionFactors`, `HoltropResistance`, `SEA_WATER_VISCOSITY`, `holtropMennenResistance` and 3 more.
