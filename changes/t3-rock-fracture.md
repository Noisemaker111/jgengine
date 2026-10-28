granular/ — loose sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield: a depth-averaged flow with the Pouliquen–Forterre friction law, Culmann cohesive banks and Bekker pressure–sinkage, costing only the cells that move

### Added

- granular/ — loose sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield: a depth-averaged flow with the Pouliquen–Forterre friction law, Culmann cohesive banks and Bekker pressure–sinkage, costing only the cells that move
- createGranularTerrain binds it to an EditableTerrain, writing every change back as a TerraformDelta; landformLooseCover reads loose depth and material from a landform's cover
- collapsedColumn, a DEM column collapse the continuum is calibrated against, with Lube et al. (2004) and Pouliquen (1999) flume checks
- parallel bonds in the DEM reference (Potyondy & Cundall 2004): bonded grains carry force and moment and break in tension or shear, with snapshot and restore
- physics/reference/bondedRock.ts, granite, sandstone, limestone and basalt as bonded grains calibrated to their Young's modulus and Brazilian strength, with Brazilian, modulus and impact tests
- fracture/, rocks that break by impact into convex fragments sized by the JKMRC t10 law and the Gaudin–Schuhmann distribution, with Vogel–Peukert breakage odds, a fragment burst and fragment meshes
- the fracture.rock generator previews a broken stone
- bun run perf fracture scores fractureRock, StructureGraph.toDebris and toDebrisBodies against the t10 law
- `boxCell` (`@jgengine/core/fracture/convexCell`): An axis-aligned box cell from `min` to `max`. Also `CellFace`, `CellPlane`, `CellVec`, `ConvexCell`, `cellContains`, `cellVolume`, `clipCell`, `transformCell`.
- `compareFracture` (`@jgengine/core/fracture/fractureComparison`): Break a 0.5 m granite block at each energy with every subject. Also `FractureComparisonRow`, `formatFractureComparison`.
- `KWH_PER_TONNE` (`@jgengine/core/fracture/fragmentSize`): 1 kWh/t in J/kg. Also `FragmentSizes`, `GaudinSchuhmannFit`, `RosinRammlerFit`, `SizeFit`, `T10Fit`, `breakageProbability`, `fitGaudinSchuhmann`, `fitRosinRammler` and 6 more.
- `BASALT_BREAKAGE` (`@jgengine/core/fracture/rockFracture`): Basalt: very hard, A×b 30. Also `FractureOptions`, `FractureResult`, `GRANITE_BREAKAGE`, `LIMESTONE_BREAKAGE`, `ROCK_BREAKAGE`, `RockBreakage`, `RockFragment`, `SANDSTONE_BREAKAGE` and 3 more.
- `FRACTURE_GENERATORS` (`@jgengine/core/fracture/rockFractureGenerator`): The fracture generators. Also `ROCK_FRACTURE_GENERATOR`, `ROCK_FRACTURE_SCHEMA`, `fragmentMesh`, `rockCell`.
- `continuumCollapse` (`@jgengine/core/granular/granularExperiments`): Release a column of `aspect` = h_i / r_i, radius `radius` m, on a flat bed and measure the deposit. Also `ContinuumCollapse`, `FlumeFlow`, `PouredHeap`, `inclinedFlume`, `pouredHeap`.
- `createGranularLayer` (`@jgengine/core/granular/granularLayer`): Create a granular layer over a bedrock grid. Also `GranularLayer`, `GranularLayerConfig`, `GranularLayerSnapshot`, `GranularPressReport`, `GranularStepReport`.
- `DAMP_SAND` (`@jgengine/core/granular/granularMaterial`): Sand with about 1% water. Also `BekkerSoil`, `DRY_SAND`, `GLASS_BEADS`, `GRAVEL`, `GranularMaterial`, `SANDY_LOAM`, `culmannHeight`, `flowFriction` and 6 more.
- `createGranularTerrain` (`@jgengine/core/granular/granularTerrain`): Bind a granular layer to a terrain's vertex grid. Also `GranularTerrain`, `GranularTerrainOptions`, `LandformCoverPlacement`, `landformLooseCover`.
- `BASALT` (`@jgengine/core/physics/reference/bondedRock`): Basalt: ρ 2900 kg/m³, E 70 GPa (reported 50–90), σ_t 14 MPa (Nevada Test Site basalt 13.1), UCS 150–350 MPa, K_IC 2.0 MPa√m (1.6–2.6) (Goodman 1989; Atkinson & Meredith 1987). Also `BEREA_SANDSTONE`, `BondedRockModel`, `BondedSpecimen`, `BrazilianResult`, `CalibrationResult`, `GrainPacking`, `INDIANA_LIMESTONE`, `ImpactOptions` and 14 more.
- `DEM_GLASS_BEADS` (`@jgengine/core/physics/reference/discreteElementExperiments`): Soda-lime glass beads: restitution 0.97 and friction 0.092 measured by Foerster, Louge, Chang & Allia (1994). Also `ColumnCollapseOptions`, `ColumnCollapseResult`, `DEM_SAND`, `DEM_STEEL`, `HopperOptions`, `HopperResult`, `JanssenFit`, `PouredConeOptions` and 16 more.
- `bridgeRuptureDistance` (`@jgengine/core/physics/reference/discreteElements`): Gap at which a bridge breaks (Lian et al. Also `DemBodySpec`, `DemBondLoad`, `DemBondSpec`, `DemInteraction`, `DemLiquid`, `DemMaterial`, `DemSnapshot`, `DemSphereSpec` and 10 more.

### Changed

- Part of #2768

### Removed

- `@jgengine/core/landform/glacial/firstOrderIceFlow` no longer exports `FirstOrderGrid`, `FirstOrderIceFlow`, `FirstOrderInput`, `FirstOrderOptions`, `FirstOrderReport`, `createFirstOrderIceFlow`.
- `@jgengine/core/landform/glacial/glacierFlow` no longer exports `GlacierModel`.
- `@jgengine/core/math/cmaEvolutionStrategy` no longer exports `CmaEvolutionStrategy`, `CmaOptions`, `CmaState`, `createCmaEvolutionStrategy`.
- `@jgengine/core/movement/reference/anthropometry` no longer exports `AnthropometricTable`, `DE_LEVA_MALE`, `HUMAN_SEGMENT`, `PlanarHumanGeometry`, `SegmentParameters`, `planarHumanSegments`.
- `@jgengine/core/movement/reference/compareLocomotion` no longer exports `HumanLocomotionReference`, `LocomotionComparisonRow`, `LocomotionMetrics`, `LocomotionProbeOptions`, `compareLocomotion`, `defaultHumanReference`, `formatLocomotionComparison`, `measureLocomotion` and 1 more.
- `@jgengine/core/movement/reference/curveRunning` no longer exports `CHANG_KRAM_CURVE_SPEEDS`, `RECREATIONAL_SPRINTER`, `SprintMechanics`, `maxCurveSpeed`, `minTurnRadius`.
- `@jgengine/core/movement/reference/footContact` no longer exports `ContactParameters`, `ContactPointState`, `GroundProfile`, `SHOE_ON_CONCRETE`, `footContactForce`, `slopeGround`, `stairGround`.
- `@jgengine/core/movement/reference/humanBody` no longer exports `FootForces`, `HumanBody`, `HumanBodyOptions`, `HumanBodyState`, `HumanJointTorques`, `HumanSide`, `createHumanBody`.
- `@jgengine/core/movement/reference/humanEnvelope` no longer exports `RECREATIONAL_SPRINT_PROFILE`, `SprintProfile`, `SprintState`, `slopeCostOfTransport`, `slopeSpeed`, `sprint`, `sprintTopSpeed`, `stoppingDistance` and 3 more.
- `@jgengine/core/movement/reference/humanGaitAnalysis` no longer exports `GaitReport`, `LocomotionDriver`, `StanceForce`, `analyzeLocomotion`.
- `@jgengine/core/movement/reference/humanGaits` no longer exports `FITTED_WALKS`, `FittedWalk`, `WALK_TERRAIN`, `WalkTerrain`, `fittedWalk`, `measureWalk`.
- `@jgengine/core/movement/reference/humanJump` no longer exports `COUNTERMOVEMENT_JUMP`, `JumpParameters`, `JumpReport`, `simulateJump`.
- `@jgengine/core/movement/reference/humanReferenceValidation` no longer exports `HumanValidationRow`, `RUNNING_NET_COST`, `formatHumanValidation`, `validateHumanReference`.
- `@jgengine/core/movement/reference/jointStrength` no longer exports `HumanJointStrength`, `JointExertion`, `LegJoint`, `YOUNG_MALE_STRENGTH`, `maxJointTorque`.
- `@jgengine/core/movement/reference/muscleTendon` no longer exports `HILL_CONSTANTS`, `MuscleJointSpan`, `MuscleSpec`, `MuscleState`, `muscleMetabolicPower`, `stepMuscle`.
- `@jgengine/core/movement/reference/planarMultibody` no longer exports `PlanarMultibody`, `PlanarSegment`, `createPlanarMultibody`.
- `@jgengine/core/movement/reference/quadrupedGait` no longer exports `ALEXANDER_JAYES_CURSORIAL`, `CreatureLocomotion`, `FroudePowerLaw`, `MAMMAL_TOP_SPEEDS`, `QUADRUPED_GAIT_TRANSITIONS`, `QuadrupedBody`, `QuadrupedComparison`, `QuadrupedGait` and 8 more.
- `@jgengine/core/movement/reference/reflexWalker` no longer exports `GEYER_HERR_MUSCLES`, `GEYER_HERR_REFLEXES`, `LegMuscle`, `LegStimulation`, `ReflexParameters`, `ReflexWalker`, `ReflexWalkerState`, `actuateLegMuscles` and 1 more.
- `@jgengine/core/movement/reference/springMassRunning` no longer exports `RECREATIONAL_RUNNER`, `SpringMassRunner`, `SpringMassStep`, `springMassStep`.
- `@jgengine/core/terrain/surveyTerrain` no longer exports `SurveyCliff`, `SurveyHills`.
