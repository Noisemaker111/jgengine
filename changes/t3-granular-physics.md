a discrete element reference for sand and gravel (physics/reference/discreteElements.ts): spheres and clumps, Hertz–Mindlin contacts, rolling resistance and capillary cohesion; deterministic, with snapshot and restore

### Added

- a discrete element reference for sand and gravel (physics/reference/discreteElements.ts): spheres and clumps, Hertz–Mindlin contacts, rolling resistance and capillary cohesion; deterministic, with snapshot and restore
- experiments that check it against published values: restitution, dry and damp angle of repose, Janssen silo saturation, Beverloo hopper discharge and the Brazil-nut effect
- `DEM_GLASS_BEADS` (`@jgengine/core/physics/reference/discreteElementExperiments`): Soda-lime glass beads: restitution 0.97 and friction 0.092 measured by Foerster, Louge, Chang & Allia (1994). Also `DEM_SAND`, `DEM_STEEL`, `HopperOptions`, `HopperResult`, `JanssenFit`, `PouredConeOptions`, `PouredConeResult`, `ShakerOptions` and 13 more.
- `bridgeRuptureDistance` (`@jgengine/core/physics/reference/discreteElements`): Gap at which a bridge breaks (Lian et al. Also `DemBodySpec`, `DemInteraction`, `DemLiquid`, `DemMaterial`, `DemSnapshot`, `DemSphereSpec`, `DemStepReport`, `DemWallMotion` and 8 more.
- `BUILTIN_PLANT_SPECIES` (`@jgengine/core/plants/grown/plantGrown`): Species the engine ships, registered with {@link registerPlantGenerators}.
- `EASTERN_WHITE_PINE_CROWN_WIDTH` (`@jgengine/core/plants/validation/crownAllometry`): FVS `cwcalc.f` species 129, eastern white pine. Also `CrownWidthEquations`, `SUGAR_MAPLE_CROWN_WIDTH`, `TALLO_CROWN_WIDTH`, `measuredCrownWidthBandM`.
- `EASTERN_WHITE_PINE_CARMEAN` (`@jgengine/core/plants/validation/heightAgeCurves`): NC-128 curve 103: eastern white pine, northern Wisconsin (FVS `htcalc.f`), total age. Also `SUGAR_MAPLE_CARMEAN`.
- `FIA_STAND_DIAMETER` (`@jgengine/core/plants/validation/stemAllometry`): Median DBH of USDA Forest Inventory and Analysis site trees (US public domain) in Wisconsin, Michigan and Minnesota on site index 55–75 ft, by age. Also `StandDiameterAtAge`.

### Changed

- Part of #2768

### Removed

- `@jgengine/core/landform/evolution/landscapeEvolution` no longer exports `CoastalParams`, `GlacialParams`.
- `@jgengine/core/landform/generator/landformGenerator` no longer exports `LANDFORM_CACHE`, `LANDFORM_GENERATOR`, `LANDFORM_OUTPUT`, `LANDFORM_SCHEMA`, `LandformCache`, `LandformCacheOptions`, `LandformGeneratorOptions`, `LandformGeneratorParams` and 8 more.
- `@jgengine/core/landform/generator/landformTerrain` no longer exports `LANDFORM_TERRAIN_MAX_SIDE`, `LANDFORM_TERRAIN_SURFACES`, `LandformRecipe`, `LandformSnapshotOptions`, `LandformTerrain`, `growLandform`, `landformTerrainSnapshot`.
- `@jgengine/core/landform/glacial/iceFlow` no longer exports `GLEN_RATE_FACTOR`, `ICE_WEIGHT`, `iceDeformationRate`.
- `@jgengine/core/landform/materials/sedimentCover` no longer exports `TILL_YIELD`.
- `@jgengine/core/plants/species/data/abiesBalsamea` no longer exports `ABIES_BALSAMEA`.
- `@jgengine/core/plants/species/data/acerRubrum` no longer exports `ACER_RUBRUM`.
- `@jgengine/core/plants/species/data/betulaPapyrifera` no longer exports `BETULA_PAPYRIFERA`.
- `@jgengine/core/plants/species/data/piceaGlauca` no longer exports `PICEA_GLAUCA`.
- `@jgengine/core/plants/species/data/pinusResinosa` no longer exports `PINUS_RESINOSA`.
- `@jgengine/core/plants/species/data/plantLibrary` no longer exports `PLANT_LIBRARY`.
- `@jgengine/core/plants/species/data/populusTremuloides` no longer exports `POPULUS_TREMULOIDES`.
- `@jgengine/core/plants/species/data/quercusRubra` no longer exports `QUERCUS_RUBRA`.
- `@jgengine/core/plants/species/data/tiliaAmericana` no longer exports `TILIA_AMERICANA`.
- `@jgengine/core/plants/species/speciesReference` no longer exports `GrowthCurve`, `REFERENCE_STAND`, `SpeciesReference`, `crownWidthBandM`, `growthCurveAt`, `standDbhAtCm`, `standHeightAtM`.
- `@jgengine/core/plants/species/speciesReferenceTable` no longer exports `SPECIES_REFERENCE`.
- `@jgengine/core/plants/validation/crownAllometry` no longer exports `ForestCrownWidthEquation`, `OpenCrownWidthEquation`.
- `@jgengine/core/scatter/scatterSolids` no longer exports `SCATTER_SOLID_LAYER`, `ScatterSolidSpec`, `scatterSolids`, `syncScatterSolids`.
