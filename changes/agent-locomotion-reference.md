a human locomotion reference in core/movement/reference: a sagittal multibody human with de Leva body segments, joint torque limits and foot contact with friction

### Added

- a human locomotion reference in core/movement/reference: a sagittal multibody human with de Leva body segments, joint torque limits and foot contact with friction
- Geyer-Herr muscle-reflex walking fitted by CMA-ES at 0.7-2.2 m/s on level ground, a 6% grade up and down, and stairs
- spring-mass running, a sprint force-velocity profile with braking and the 505 turn test, curve-running speed limits, and a torque-driven countermovement jump
- validateHumanReference checks the reference against published walking, running, sprint, turn and jump data
- `createCmaEvolutionStrategy` (`@jgengine/core/math/cmaEvolutionStrategy`): Creates a CMA-ES minimiser (N. Also `CmaEvolutionStrategy`, `CmaOptions`, `CmaState`.
- `DE_LEVA_MALE` (`@jgengine/core/movement/reference/anthropometry`): Adult male body-segment parameters of P. Also `AnthropometricTable`, `HUMAN_SEGMENT`, `PlanarHumanGeometry`, `SegmentParameters`, `planarHumanSegments`.
- `CHANG_KRAM_CURVE_SPEEDS` (`@jgengine/core/movement/reference/curveRunning`): Chang & Kram (2007) measured top speeds on flat curves by radius (m → m/s), and on the straight. Also `RECREATIONAL_SPRINTER`, `SprintMechanics`, `maxCurveSpeed`, `minTurnRadius`.
- `SHOE_ON_CONCRETE` (`@jgengine/core/movement/reference/footContact`): Shoe sole on a hard floor. Also `ContactParameters`, `ContactPointState`, `GroundProfile`, `footContactForce`, `slopeGround`, `stairGround`.
- `createHumanBody` (`@jgengine/core/movement/reference/humanBody`): Creates the sagittal reference human (Winter's seven-segment gait model with de Leva anthropometry), stepping its exact multibody dynamics with semi-implicit Euler at a fixed step. Also `FootForces`, `HumanBody`, `HumanBodyOptions`, `HumanBodyState`, `HumanJointTorques`, `HumanSide`.
- `RECREATIONAL_SPRINT_PROFILE` (`@jgengine/core/movement/reference/humanEnvelope`): A physically active young man (80 kg, 1.80 m) who is not a trained sprinter: F0 7.5 N/kg sits in the team-sport and recreational range of the force–velocity profiles in J.-B. Also `SprintProfile`, `SprintState`, `slopeCostOfTransport`, `slopeSpeed`, `sprint`, `sprintTopSpeed`, `stoppingDistance`, `test505Time` and 1 more.
- `analyzeLocomotion` (`@jgengine/core/movement/reference/humanGaitAnalysis`): Measure a driver's steady gait: run `settle` seconds, then `measure` seconds of speed, stride, duty factor, flight, per-stance vertical ground force shape and metabolic cost of transport. Also `GaitReport`, `LocomotionDriver`, `StanceForce`.
- `FITTED_WALKS` (`@jgengine/core/movement/reference/humanGaits`): Geyer–Herr reflex parameters fitted by CMA-ES on the 80 kg, 1.80 m reference human, minimising gross metabolic cost of transport at the target speed with penalties on speed error, step-time variation, a heel-strike transient above 1.3 body weights, a loading peak above 1.25, a mid-stance valley under 0.55, and any flight phase. Also `FittedWalk`, `WALK_TERRAIN`, `WalkTerrain`, `fittedWalk`, `measureWalk`.
- `COUNTERMOVEMENT_JUMP` (`@jgengine/core/movement/reference/humanJump`): Fitted by CMA-ES maximising the reference human's jump height with the trunk within 0.25 rad of upright at takeoff and the push force under 3 body weights. Also `JumpParameters`, `JumpReport`, `simulateJump`.
- `RUNNING_NET_COST` (`@jgengine/core/movement/reference/humanReferenceValidation`): Net metabolic cost of level running, J/(kg·m), nearly independent of speed: 3.8–4.0 (P. Also `HumanValidationRow`, `formatHumanValidation`, `validateHumanReference`.
- `YOUNG_MALE_STRENGTH` (`@jgengine/core/movement/reference/jointStrength`): Young adult male lower-limb strength. Also `HumanJointStrength`, `JointExertion`, `LegJoint`, `maxJointTorque`.
- `HILL_CONSTANTS` (`@jgengine/core/movement/reference/muscleTendon`): Shared contractile and elastic constants of the muscle model of H. Also `MuscleJointSpan`, `MuscleSpec`, `MuscleState`, `muscleMetabolicPower`, `stepMuscle`.
- `createPlanarMultibody` (`@jgengine/core/movement/reference/planarMultibody`): Creates a {@link PlanarMultibody} from segments. Also `PlanarMultibody`, `PlanarSegment`.
- `GEYER_HERR_MUSCLES` (`@jgengine/core/movement/reference/reflexWalker`): Muscle–tendon units of H. Also `GEYER_HERR_REFLEXES`, `LegMuscle`, `LegStimulation`, `ReflexParameters`, `ReflexWalker`, `ReflexWalkerState`, `actuateLegMuscles`, `createReflexWalker`.
- `RECREATIONAL_RUNNER` (`@jgengine/core/movement/reference/springMassRunning`): An 80 kg, 1.80 m man: leg length 0.94 m; leg stiffness 11 kN/m for 70 kg scaled with body mass (C. Also `SpringMassRunner`, `SpringMassStep`, `springMassStep`.
- `BUILTIN_PLANT_SPECIES` (`@jgengine/core/plants/grown/plantGrown`): Species the engine ships, registered with {@link registerPlantGenerators}.
- `EASTERN_WHITE_PINE_CROWN_WIDTH` (`@jgengine/core/plants/validation/crownAllometry`): FVS `cwcalc.f` species 129, eastern white pine. Also `CrownWidthEquations`, `SUGAR_MAPLE_CROWN_WIDTH`, `TALLO_CROWN_WIDTH`, `measuredCrownWidthBandM`.
- `EASTERN_WHITE_PINE_CARMEAN` (`@jgengine/core/plants/validation/heightAgeCurves`): NC-128 curve 103: eastern white pine, northern Wisconsin (FVS `htcalc.f`), total age. Also `SUGAR_MAPLE_CARMEAN`.
- `FIA_STAND_DIAMETER` (`@jgengine/core/plants/validation/stemAllometry`): Median DBH of USDA Forest Inventory and Analysis site trees (US public domain) in Wisconsin, Michigan and Minnesota on site index 55–75 ft, by age. Also `StandDiameterAtAge`.

### Changed

- Part of #2767

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
