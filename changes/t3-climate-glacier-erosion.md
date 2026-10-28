glaciers follow the LR04 glacial cycles: snowlineHistory scales the snowline by the benthic δ18O stack (Lisiecki and Raymo 2005, CC BY), and GlacialParams.elaHistory feeds it to a run

Root cause: the explicit shallow-ice relaxation never converged on 100 m mountain grids (residual near 65 m/yr), and per-face directional flux ratios dammed first-order ice into cliffs

Refs #2778

### Migrate

- landform snapshots are version 4 (iceEastScale and iceSouthScale replace iceFlux); GlacialParams.iceYears and iceSteps are replaced by iceStep, ela is optional when elaHistory is given, and the default erosion constant is 1e-4·50^(1−l)

### Added

- glaciers follow the LR04 glacial cycles: snowlineHistory scales the snowline by the benthic δ18O stack (Lisiecki and Raymo 2005, CC BY), and GlacialParams.elaHistory feeds it to a run
- only beds at the pressure-melting point slide and erode; thin ice high above the snowline stays frozen to its rock (snowlineTemperature, lapseRate, geothermalFlux)
- meltwater supercooling stops a glacier wearing its bed where the bed climbs out of an overdeepening too steeply (Alley et al. 2003)
- `LR04_STACK` (`@jgengine/core/landform/glacial/glacialClimate`): The LR04 benthic δ¹⁸O stack (Lisiecki & Raymo 2005), 0 to 800 ka. Also `Delta18ORecord`, `SnowlineHistory`, `SnowlineHistoryOptions`, `snowlineAt`, `snowlineHistory`.

### Changed

- ice shields its bed from rivers, soil creep and lakes, rockfall onto a glacier rides it to the snout, and till melts out over the ablation zone

### Fixed

- ice thickness is solved fully implicitly by Newton's method with an active set, so glaciers converge on real mountains instead of piling up 15 times too much ice
- first-order glaciers match each face's speed to the first-order solve, so a smooth steep bed carries a smooth ice surface (steps under 2 m, from 130–150 m)

### Removed

- `@jgengine/core/fracture/convexCell` no longer exports `CellFace`, `CellPlane`, `CellVec`, `ConvexCell`, `boxCell`, `cellContains`, `cellVolume`, `clipCell` and 1 more.
- `@jgengine/core/fracture/fractureComparison` no longer exports `FractureComparisonRow`, `compareFracture`, `formatFractureComparison`.
- `@jgengine/core/fracture/fragmentSize` no longer exports `FragmentSizes`, `GaudinSchuhmannFit`, `KWH_PER_TONNE`, `RosinRammlerFit`, `SizeFit`, `T10Fit`, `breakageProbability`, `fitGaudinSchuhmann` and 7 more.
- `@jgengine/core/fracture/rockFracture` no longer exports `BASALT_BREAKAGE`, `FractureOptions`, `FractureResult`, `GRANITE_BREAKAGE`, `LIMESTONE_BREAKAGE`, `ROCK_BREAKAGE`, `RockBreakage`, `RockFragment` and 4 more.
- `@jgengine/core/fracture/rockFractureGenerator` no longer exports `FRACTURE_GENERATORS`, `ROCK_FRACTURE_GENERATOR`, `ROCK_FRACTURE_SCHEMA`, `fragmentMesh`, `rockCell`.
- `@jgengine/core/granular/granularExperiments` no longer exports `ContinuumCollapse`, `FlumeFlow`, `PouredHeap`, `continuumCollapse`, `inclinedFlume`, `pouredHeap`.
- `@jgengine/core/granular/granularLayer` no longer exports `GranularLayer`, `GranularLayerConfig`, `GranularLayerSnapshot`, `GranularPressReport`, `GranularStepReport`, `createGranularLayer`.
- `@jgengine/core/granular/granularMaterial` no longer exports `BekkerSoil`, `DAMP_SAND`, `DRY_SAND`, `GLASS_BEADS`, `GRAVEL`, `GranularMaterial`, `SANDY_LOAM`, `culmannHeight` and 7 more.
- `@jgengine/core/granular/granularTerrain` no longer exports `GranularTerrain`, `GranularTerrainOptions`, `LandformCoverPlacement`, `createGranularTerrain`, `landformLooseCover`.
- `@jgengine/core/math/cmaEvolutionStrategy` no longer exports `CmaEvolutionStrategy`, `CmaOptions`, `CmaState`, `createCmaEvolutionStrategy`.
- `@jgengine/core/movement/reference/anthropometry` no longer exports `AnthropometricTable`, `DE_LEVA_MALE`, `HUMAN_SEGMENT`, `PlanarHumanGeometry`, `SegmentParameters`, `planarHumanSegments`.
- `@jgengine/core/movement/reference/compareLocomotion` no longer exports `HumanLocomotionReference`, `LocomotionComparisonRow`, `LocomotionMetrics`, `LocomotionProbeOptions`, `compareLocomotion`, `defaultHumanReference`, `formatLocomotionComparison`, `measureLocomotion` and 1 more.
- `@jgengine/core/movement/reference/compareRagdollFall` no longer exports `INJURY_LIMITS`, `RagdollFallOptions`, `RagdollFallRow`, `compareRagdollFall`, `formatRagdollFall`, `humanRagdollConfig`, `measureRagdollFall`, `stockHumanoidRagdoll`.
- `@jgengine/core/movement/reference/curveRunning` no longer exports `CHANG_KRAM_CURVE_SPEEDS`, `RECREATIONAL_SPRINTER`, `SprintMechanics`, `maxCurveSpeed`, `minTurnRadius`.
- `@jgengine/core/movement/reference/footContact` no longer exports `ContactParameters`, `ContactPointState`, `GroundProfile`, `SHOE_ON_CONCRETE`, `footContactForce`, `slopeGround`, `stairGround`.
- `@jgengine/core/movement/reference/humanBody` no longer exports `FootForces`, `HumanBody`, `HumanBodyOptions`, `HumanBodyState`, `HumanJointTorques`, `HumanSide`, `createHumanBody`.
- `@jgengine/core/movement/reference/humanEnvelope` no longer exports `RECREATIONAL_SPRINT_PROFILE`, `SprintProfile`, `SprintState`, `slopeCostOfTransport`, `slopeSpeed`, `sprint`, `sprintTopSpeed`, `stoppingDistance` and 3 more.
- `@jgengine/core/movement/reference/humanFall` no longer exports `FallOptions`, `FallReport`, `FallTone`, `GRUBER_WOBBLING_MASSES`, `HEAD_ON_FLOOR`, `LANDING_ACTIVATION`, `PELVIS_ON_FLOOR`, `WobblingMass` and 2 more.
- `@jgengine/core/movement/reference/humanGaitAnalysis` no longer exports `GaitReport`, `LocomotionDriver`, `StanceForce`, `analyzeLocomotion`.
- `@jgengine/core/movement/reference/humanGaits` no longer exports `FITTED_WALKS`, `FittedWalk`, `WALK_TERRAIN`, `WalkTerrain`, `fittedWalk`, `measureWalk`.
- `@jgengine/core/movement/reference/humanJump` no longer exports `COUNTERMOVEMENT_JUMP`, `JumpParameters`, `JumpReport`, `simulateJump`.
- `@jgengine/core/movement/reference/humanReferenceValidation` no longer exports `HumanValidationRow`, `RUNNING_NET_COST`, `formatHumanValidation`, `validateHumanReference`.
- `@jgengine/core/movement/reference/jointStrength` no longer exports `HumanJointStrength`, `JointExertion`, `LegJoint`, `YOUNG_MALE_STRENGTH`, `maxJointTorque`.
- `@jgengine/core/movement/reference/muscleTendon` no longer exports `HILL_CONSTANTS`, `MuscleJointSpan`, `MuscleSpec`, `MuscleState`, `muscleMetabolicPower`, `stepMuscle`.
- `@jgengine/core/movement/reference/planarMultibody` no longer exports `PlanarMultibody`, `PlanarSegment`, `createPlanarMultibody`.
- `@jgengine/core/movement/reference/quadrupedGait` no longer exports `ALEXANDER_JAYES_CURSORIAL`, `CreatureLocomotion`, `FroudePowerLaw`, `MAMMAL_TOP_SPEEDS`, `QuadrupedBody`, `QuadrupedComparison`, `QuadrupedGait`, `QuadrupedStride` and 9 more.
- `@jgengine/core/movement/reference/reflexWalker` no longer exports `GEYER_HERR_MUSCLES`, `GEYER_HERR_REFLEXES`, `LegMuscle`, `LegStimulation`, `ReflexParameters`, `ReflexWalker`, `ReflexWalkerState`, `actuateLegMuscles` and 1 more.
- `@jgengine/core/movement/reference/springMassRunning` no longer exports `RECREATIONAL_RUNNER`, `SpringMassRunner`, `SpringMassStep`, `springMassStep`.
- `@jgengine/core/physics/reference/bondedRock` no longer exports `BASALT`, `BEREA_SANDSTONE`, `BondedRockModel`, `BondedSpecimen`, `BrazilianResult`, `CalibrationResult`, `GrainPacking`, `INDIANA_LIMESTONE` and 15 more.
- `@jgengine/core/physics/reference/discreteElementExperiments` no longer exports `ColumnCollapseOptions`, `ColumnCollapseResult`, `DEM_GLASS_BEADS`, `DEM_SAND`, `DEM_STEEL`, `HopperOptions`, `HopperResult`, `JanssenFit` and 17 more.
- `@jgengine/core/physics/reference/discreteElements` no longer exports `DemBodySpec`, `DemBondLoad`, `DemBondSpec`, `DemInteraction`, `DemLiquid`, `DemMaterial`, `DemSnapshot`, `DemSphereSpec` and 11 more.
- `@jgengine/core/terrain/surveyTerrain` no longer exports `SurveyCliff`, `SurveyHills`.
