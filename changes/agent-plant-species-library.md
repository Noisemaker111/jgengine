`bun run jgengine plants import|fit|write|report` imports FIA site trees, Carmean curves, Ek and Bechtold crown widths and Tallo crowns, and fits each species' growth by CMA-ES (Stava et al. 2014) across worker threads

### Added

- `bun run jgengine plants import|fit|write|report` imports FIA site trees, Carmean curves, Ek and Bechtold crown widths and Tallo crowns, and fits each species' growth by CMA-ES (Stava et al. 2014) across worker threads
- PLANT_LIBRARY of 10 fitted species (sugar and red maple, white and red pine, northern red oak, paper birch, white spruce, quaking aspen, basswood, balsam fir), each within ±15% height and ±25% DBH of FIA dominant trees and inside the Tallo p10–p90 crown width at 20, 50 and 100 years
- SPECIES_REFERENCE and REFERENCE_STAND, the imported targets every species is tested against
- `ABIES_BALSAMEA` (`@jgengine/core/plants/species/data/abiesBalsamea`): Balsam fir.
- `ACER_RUBRUM` (`@jgengine/core/plants/species/data/acerRubrum`): Red maple.
- `BETULA_PAPYRIFERA` (`@jgengine/core/plants/species/data/betulaPapyrifera`): Paper birch.
- `PICEA_GLAUCA` (`@jgengine/core/plants/species/data/piceaGlauca`): White spruce.
- `PINUS_RESINOSA` (`@jgengine/core/plants/species/data/pinusResinosa`): Red pine.
- `PLANT_LIBRARY` (`@jgengine/core/plants/species/data/plantLibrary`): Every species record the engine ships, registered with the grown-plant generator.
- `POPULUS_TREMULOIDES` (`@jgengine/core/plants/species/data/populusTremuloides`): Quaking aspen.
- `QUERCUS_RUBRA` (`@jgengine/core/plants/species/data/quercusRubra`): Northern red oak.
- `TILIA_AMERICANA` (`@jgengine/core/plants/species/data/tiliaAmericana`): American basswood.
- `REFERENCE_STAND` (`@jgengine/core/plants/species/speciesReference`): The stand a species is grown in to compare with its reference: fully stocked and even-aged, seen from a dominant tree. Also `GrowthCurve`, `SpeciesReference`, `crownWidthBandM`, `growthCurveAt`, `standDbhAtCm`, `standHeightAtM`.
- `SPECIES_REFERENCE` (`@jgengine/core/plants/species/speciesReferenceTable`): Written by `bun run jgengine plants import` from USDA FIA site trees and FVS (US public domain), Tallo (Jucker et al.
- `ForestCrownWidthEquation` (`@jgengine/core/plants/validation/crownAllometry`): Bechtold 2003 forest-grown crown width CW = a + b·D + cr·CR% + hi·HI in feet from DBH in inches, used from 5 in DBH, as coded in FVS Lake States `cwcalc.f` (US public domain). Also `OpenCrownWidthEquation`.
- `FireSpreadLayer` (`@jgengine/core/weather/FireSpreadLayer.draw`): Draw a fire-spread grid as billboarded flames on burning cells and embers on burnt ones. Also `FireSpreadLayerProps`.
- `createFireGrid` (`@jgengine/core/weather/weather`): Create a {@link FireGrid}; throws on sizes outside its cell budget. Also `FireCell`, `FireCellState`, `FireGrid`, `FireGridConfig`, `FireGridTuning`, `FireStepOptions`.
- `createFireGrid` (`@jgengine/core/world`): Create a {@link FireGrid}; throws on sizes outside its cell budget. Also `FireGrid`.

### Changed

- the reference stand is spaced for a dominant tree (spacing index 0.3, Oliver & Larson 1996), and 20-year DBH targets come from the FIA site trees' height–diameter relation where the site trees hold no trees that young
- Part of #2699

### Removed

- `@jgengine/core/fire/crownFire` no longer exports `CANOPY_HEAT_KJ_KG`, `CanopyFuel`, `CrownFire`, `CrownFireType`, `activeCrownCriticalRate`, `assessCrownFire`, `canopyFuelLoad`, `crownFlameLength` and 3 more.
- `@jgengine/core/fire/fireArrays` no longer exports `decodeFireArray`, `encodeFireArray`.
- `@jgengine/core/fire/fireLandscape` no longer exports `CanopyStand`, `DEFAULT_FIRE_TUNING`, `FireBurnState`, `FireCellKind`, `FireCellReading`, `FireLandscape`, `FireLandscapeConfig`, `FireLandscapeSnapshot` and 6 more.
- `@jgengine/core/fire/FireLandscape.draw` no longer exports `FireLandscapeView`, `FireLandscapeViewProps`.
- `@jgengine/core/fire/fuelModels` no longer exports `ANDERSON_FUEL_MODELS`, `FuelLoads`, `FuelModel`, `FuelMoisture`, `KG_M2_PER_LB_FT2`, `KG_M2_PER_TON_ACRE`, `KJ_KG_PER_BTU_LB`, `MOISTURE_SCENARIOS` and 5 more.
- `@jgengine/core/fire/fuelMoisture` no longer exports `DEFAULT_FUEL_MOISTURE_TUNING`, `FuelMoistureModel`, `FuelMoistureSnapshot`, `FuelMoistureTuning`, `MoistureWeather`, `createFuelMoistureModel`, `equilibriumMoistureContent`, `fuelLevelWeather` and 2 more.
- `@jgengine/core/fire/fuelSources` no longer exports `FireGridFrame`, `PlantCanopyFuel`, `plantCanopyFuel`, `rasterizeCanopyFuel`, `sampleFireGround`, `sunExposure`.
- `@jgengine/core/fire/spotting` no longer exports `SpotDistance`, `SpotTerrain`, `TorchingSpecies`, `emberIgnitionProbability`, `surfaceFireSpotDistance`, `torchingTreeSpotDistance`.
- `@jgengine/core/fire/surfaceFire` no longer exports `KW_M_PER_BTU_FT_S`, `MPS_PER_MPH`, `SpreadConditions`, `SurfaceFuelbed`, `SurfaceSpread`, `WindLimit`, `curedHerbFraction`, `ellipseEccentricity` and 9 more.
- `@jgengine/core/fire/windAdjustment` no longer exports `CanopyShelter`, `twentyFootWind`, `windAdjustmentFactor`.
- `@jgengine/core/landform/dunes/duneField` no longer exports `DEFAULT_DUNE_PARAMS`, `DuneField`, `DuneFieldOptions`, `DuneGrid`, `DuneInitial`, `DuneParams`, `DuneSnapshot`, `WindMode` and 2 more.
- `@jgengine/core/landform/evolution/landscapeEvolution` no longer exports `DEFAULT_LANDFORM_PARAMS`, `LandformFields`, `LandformInitial`, `LandformParams`, `LandformSnapshot`, `LandformStepReport`, `LandscapeEvolution`, `LandscapeEvolutionOptions` and 2 more.
- `@jgengine/core/landform/evolution/rockStrata` no longer exports `LandformStrata`, `RockLayer`, `UNIFORM_ROCK`.
- `@jgengine/core/landform/flow/dInfinity` no longer exports `dInfinityArea`.
- `@jgengine/core/landform/flow/flowRouting` no longer exports `FLAT_RISE`, `FlowRouting`.
- `@jgengine/core/landform/grid/landformGrid` no longer exports `D8_DCOL`, `D8_DROW`, `LANDFORM_MAX_SIDE`, `LandformEdge`, `LandformGrid`.
- `@jgengine/core/landform/materials/landformSurface` no longer exports `LANDFORM_SURFACE_KINDS`, `LandformSurface`, `LandformSurfaceKind`, `LandformSurfaceOptions`, `landformSurface`.
- `@jgengine/core/landform/materials/sedimentCover` no longer exports `COVER_CLASSES`, `CoverClass`, `DEFAULT_GRAIN_SIZES`, `DEFAULT_ROCK_YIELD`, `GRAIN_CLASSES`, `GrainClass`, `GrainMix`, `GrainSizes` and 4 more.
- `@jgengine/core/landform/validation/geomorphicLaws` no longer exports `ChannelSelection`, `PowerLawFit`, `fitPowerLaw`, `hackLawFit`, `slopeAreaFit`, `upstreamLength`.
- `@jgengine/core/physics/reference/boatComparison` no longer exports `BoatComparisonSubject`, `ManoeuvringSubject`, `ReferenceBoat`, `compareBoat`, `holtropExampleSubject`, `kvlcc2Subject`, `referenceBoatSubjects`, `referenceSubjectFor` and 2 more.
- `@jgengine/core/physics/reference/hullForm` no longer exports `HullMesh`, `HullOffsets`, `PrismaticPlaningHullOptions`, `WigleyHullOptions`, `boxBarge`, `hullMeshFromOffsets`, `meshVolume`, `prismaticPlaningHull` and 1 more.
- `@jgengine/core/physics/reference/hullHydrostatics` no longer exports `FloatingAttitude`, `FloatingCondition`, `HullIntegrator`, `HullLoads`, `HullWater`, `HydrostaticParticulars`, `MARINE_GRAVITY`, `RightingArmPoint` and 10 more.
- `@jgengine/core/physics/reference/marinePropeller` no longer exports `BSeriesPropeller`, `OpenWaterPoint`, `PropellerOperatingPoint`, `ScrewBladeSection`, `Waterjet`, `WaterjetPoint`, `bSeriesBladeSection`, `bSeriesOpenWater` and 5 more.
- `@jgengine/core/physics/reference/planingHull` no longer exports `NACA_TN2876_MODEL`, `NACA_TN2876_RUNS`, `PlaningEquilibrium`, `PlaningFluid`, `PlaningHull`, `PlaningState`, `PrismaticPlaningRun`, `planingAtTrim` and 4 more.
- `@jgengine/core/physics/reference/shipManoeuvring` no longer exports `KVLCC2_L7`, `KVLCC2_L7_PUBLISHED`, `KVLCC2_L7_SPEED`, `ManoeuvringTrialBoat`, `MmgForces`, `MmgHullDerivatives`, `MmgPropeller`, `MmgRudder` and 11 more.
- `@jgengine/core/physics/reference/shipResistance` no longer exports `HOLTROP_MENNEN_EXAMPLE`, `HoltropConditions`, `HoltropHull`, `HoltropPropeller`, `HoltropPropulsionFactors`, `HoltropResistance`, `SEA_WATER_VISCOSITY`, `holtropMennenResistance` and 3 more.
- `@jgengine/core/plants/grown/plantGrown` no longer exports `BUILTIN_PLANT_SPECIES`.
- `@jgengine/core/plants/validation/crownAllometry` no longer exports `CrownWidthEquations`, `EASTERN_WHITE_PINE_CROWN_WIDTH`, `SUGAR_MAPLE_CROWN_WIDTH`, `TALLO_CROWN_WIDTH`, `measuredCrownWidthBandM`.
- `@jgengine/core/plants/validation/heightAgeCurves` no longer exports `EASTERN_WHITE_PINE_CARMEAN`, `SUGAR_MAPLE_CARMEAN`.
- `@jgengine/core/plants/validation/stemAllometry` no longer exports `FIA_STAND_DIAMETER`, `StandDiameterAtAge`.
- `@jgengine/core/world` no longer exports `FireLandscape`, `createFireLandscape`.
- `@jgengine/core/world/authoredSimulation` no longer exports `AuthoredFireRuntime`.
