landform material layers: rivers sort gravel, sand and silt by settling speed (alluvial fans fine downstream, lakes keep a coarse delta and settle silt over their floor), landslides lay scree, and bedrock weathers into soil by the Heimsath soil production function

### Added

- landform material layers: rivers sort gravel, sand and silt by settling speed (alluvial fans fine downstream, lakes keep a coarse delta and settle silt over their floor), landslides lay scree, and bedrock weathers into soil by the Heimsath soil production function
- landformSurface reads a landscape out as per-cell blend weights over the rock, gravel, sand, mud and soil surface materials, with the bedrock id under each cell
- createDuneField grows barchan, transverse, linear and star dunes from a wind regime and sand supply (Werner 1995 slab model): slip faces stand at the angle of repose and dunes migrate at a speed inversely proportional to height
- `DEFAULT_DUNE_PARAMS` (`@jgengine/core/landform/dunes/duneField`): Werner's (1995) rules: one wind toward the east, hop 1, landing 0.6 on sand and 0.4 on bed, 15° shadow. Also `DuneField`, `DuneFieldOptions`, `DuneGrid`, `DuneInitial`, `DuneParams`, `DuneSnapshot`, `WindMode`, `createDuneField` and 1 more.
- `LANDFORM_SURFACE_KINDS` (`@jgengine/core/landform/materials/landformSurface`): The surface kinds a landform paints, in their order in {@link LandformSurface.weights}. Also `LandformSurface`, `LandformSurfaceKind`, `LandformSurfaceOptions`, `landformSurface`.
- `COVER_CLASSES` (`@jgengine/core/landform/materials/sedimentCover`): Classes of loose cover, in their order in {@link SedimentCover.thickness}. Also `CoverClass`, `DEFAULT_GRAIN_SIZES`, `DEFAULT_ROCK_YIELD`, `GRAIN_CLASSES`, `GrainClass`, `GrainMix`, `GrainSizes`, `SCREE_YIELD` and 3 more.

### Changed

- Part of #2742

### Removed

- `@jgengine/core/fire/fuelModels` no longer exports `ANDERSON_FUEL_MODELS`, `FuelLoads`, `FuelModel`, `FuelMoisture`, `KG_M2_PER_LB_FT2`, `KG_M2_PER_TON_ACRE`, `KJ_KG_PER_BTU_LB`, `MOISTURE_SCENARIOS` and 5 more.
- `@jgengine/core/fire/surfaceFire` no longer exports `KW_M_PER_BTU_FT_S`, `MPS_PER_MPH`, `SpreadConditions`, `SurfaceFuelbed`, `SurfaceSpread`, `WindLimit`, `curedHerbFraction`, `ellipseEccentricity` and 9 more.
- `@jgengine/core/fire/windAdjustment` no longer exports `CanopyShelter`, `twentyFootWind`, `windAdjustmentFactor`.
- `@jgengine/core/physics/reference/boatComparison` no longer exports `BoatComparisonSubject`, `ReferenceBoat`, `compareBoat`, `holtropExampleSubject`, `referenceBoatSubjects`, `referenceSubjectFor`, `speedboatSubject`, `surgeAddedMass`.
- `@jgengine/core/physics/reference/hullForm` no longer exports `HullMesh`, `HullOffsets`, `PrismaticPlaningHullOptions`, `WigleyHullOptions`, `boxBarge`, `hullMeshFromOffsets`, `meshVolume`, `prismaticPlaningHull` and 1 more.
- `@jgengine/core/physics/reference/hullHydrostatics` no longer exports `FloatingAttitude`, `FloatingCondition`, `HullIntegrator`, `HullLoads`, `HullWater`, `HydrostaticParticulars`, `MARINE_GRAVITY`, `RightingArmPoint` and 10 more.
- `@jgengine/core/physics/reference/marinePropeller` no longer exports `BSeriesPropeller`, `OpenWaterPoint`, `PropellerOperatingPoint`, `ScrewBladeSection`, `Waterjet`, `WaterjetPoint`, `bSeriesBladeSection`, `bSeriesOpenWater` and 5 more.
- `@jgengine/core/physics/reference/planingHull` no longer exports `NACA_TN2876_MODEL`, `NACA_TN2876_RUNS`, `PlaningEquilibrium`, `PlaningFluid`, `PlaningHull`, `PlaningState`, `PrismaticPlaningRun`, `planingAtTrim` and 4 more.
- `@jgengine/core/physics/reference/shipResistance` no longer exports `HOLTROP_MENNEN_EXAMPLE`, `HoltropConditions`, `HoltropHull`, `HoltropPropeller`, `HoltropPropulsionFactors`, `HoltropResistance`, `SEA_WATER_VISCOSITY`, `holtropMennenResistance` and 3 more.
