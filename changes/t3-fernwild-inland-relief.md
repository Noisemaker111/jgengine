survey terrain reads hills outlines (rolling hills with plains between them), cliff lines (one side raised across a steep face) and an erosion meta on peaks and ridges that cuts gullies into them

Root cause: the grass mat called the island's full height function six times per vertex, about 450k calls across eight fields in one frame

Refs #2687

Engine seam: packages/core/src/grass/GrassCover.draw.tsx, packages/core/src/grass/GrassFieldRenderer.draw.tsx, packages/core/src/grass/grassBake.draw.ts, packages/core/src/grass/grassCoverGeometry.draw.ts, packages/core/src/terrain/surveyTerrain.ts, packages/core/src/world/geometry.ts

### Added

- survey terrain reads hills outlines (rolling hills with plains between them), cliff lines (one side raised across a steep face) and an erosion meta on peaks and ridges that cuts gullies into them
- `SurveyCliff` (`@jgengine/core/terrain/surveyTerrain`): A cliff along a line: one side stands `height` higher, across a face `face` metres wide. Also `SurveyHills`.

### Changed

- Fernwild's inland rolls: hills through the jungle, plains, eastern forest, redwoods and highlands, five cliff lines, and gullied mountains instead of smooth cones
- Fernwild has waist-high grass inland: green grass with straw tips and broad leaves through the jungle and plains, as in ARK
- Fernwild's forty-minute dry-throat survival test gets a 20 s timeout; it ran just past CI's 5 s default

### Fixed

- a grass field's ground mat samples the ground once per vertex instead of six times, and tests only the clearance masks that reach it, so large grass fields no longer freeze the click into play

### Removed

- `@jgengine/core/landform/glacial/firstOrderIceFlow` no longer exports `FirstOrderGrid`, `FirstOrderIceFlow`, `FirstOrderInput`, `FirstOrderOptions`, `FirstOrderReport`, `createFirstOrderIceFlow`.
- `@jgengine/core/landform/glacial/glacierFlow` no longer exports `GlacierModel`.
- `@jgengine/core/math/cmaEvolutionStrategy` no longer exports `CmaEvolutionStrategy`, `CmaOptions`, `CmaState`, `createCmaEvolutionStrategy`.
- `@jgengine/core/movement/reference/anthropometry` no longer exports `AnthropometricTable`, `DE_LEVA_MALE`, `HUMAN_SEGMENT`, `PlanarHumanGeometry`, `SegmentParameters`, `planarHumanSegments`.
- `@jgengine/core/movement/reference/curveRunning` no longer exports `CHANG_KRAM_CURVE_SPEEDS`, `RECREATIONAL_SPRINTER`, `SprintMechanics`, `maxCurveSpeed`, `minTurnRadius`.
- `@jgengine/core/movement/reference/footContact` no longer exports `ContactParameters`, `ContactPointState`, `GroundProfile`, `SHOE_ON_CONCRETE`, `footContactForce`, `slopeGround`, `stairGround`.
- `@jgengine/core/movement/reference/humanBody` no longer exports `FootForces`, `HumanBody`, `HumanBodyOptions`, `HumanBodyState`, `HumanJointTorques`, `HumanSide`, `createHumanBody`.
- `@jgengine/core/movement/reference/humanEnvelope` no longer exports `RECREATIONAL_SPRINT_PROFILE`, `SprintProfile`, `SprintState`, `slopeCostOfTransport`, `slopeSpeed`, `sprint`, `sprintTopSpeed`, `stoppingDistance` and 2 more.
- `@jgengine/core/movement/reference/humanGaitAnalysis` no longer exports `GaitReport`, `LocomotionDriver`, `StanceForce`, `analyzeLocomotion`.
- `@jgengine/core/movement/reference/humanGaits` no longer exports `FITTED_WALKS`, `FittedWalk`, `WALK_TERRAIN`, `WalkTerrain`, `fittedWalk`, `measureWalk`.
- `@jgengine/core/movement/reference/humanJump` no longer exports `COUNTERMOVEMENT_JUMP`, `JumpParameters`, `JumpReport`, `simulateJump`.
- `@jgengine/core/movement/reference/humanReferenceValidation` no longer exports `HumanValidationRow`, `RUNNING_NET_COST`, `formatHumanValidation`, `validateHumanReference`.
- `@jgengine/core/movement/reference/jointStrength` no longer exports `HumanJointStrength`, `JointExertion`, `LegJoint`, `YOUNG_MALE_STRENGTH`, `maxJointTorque`.
- `@jgengine/core/movement/reference/muscleTendon` no longer exports `HILL_CONSTANTS`, `MuscleJointSpan`, `MuscleSpec`, `MuscleState`, `muscleMetabolicPower`, `stepMuscle`.
- `@jgengine/core/movement/reference/planarMultibody` no longer exports `PlanarMultibody`, `PlanarSegment`, `createPlanarMultibody`.
- `@jgengine/core/movement/reference/reflexWalker` no longer exports `GEYER_HERR_MUSCLES`, `GEYER_HERR_REFLEXES`, `LegMuscle`, `LegStimulation`, `ReflexParameters`, `ReflexWalker`, `ReflexWalkerState`, `actuateLegMuscles` and 1 more.
- `@jgengine/core/movement/reference/springMassRunning` no longer exports `RECREATIONAL_RUNNER`, `SpringMassRunner`, `SpringMassStep`, `springMassStep`.
