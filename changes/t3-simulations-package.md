Rock fracture, boats, flow corridors and granular experiments move to @jgengine/simulations

Engine seam: packages/core/src/physics/ballisticSweep.ts, packages/simulations/src/fracture/convexCell.ts, packages/simulations/src/fracture/fractureComparison.ts, packages/simulations/src/fracture/fragmentSize.ts, packages/simulations/src/fracture/rockFracture.ts, packages/simulations/src/fracture/rockFractureGenerator.ts, packages/simulations/src/granular/granularExperiments.ts, packages/simulations/src/physics/boatDynamics.ts and 8 more

### Changed

- Rock fracture, boats, flow corridors and granular experiments move to @jgengine/simulations

### Removed

- `@jgengine/core/fracture/convexCell` no longer exports `CellFace`, `CellPlane`, `CellVec`, `ConvexCell`, `boxCell`, `cellContains`, `cellVolume`, `clipCell` and 1 more.
- `@jgengine/core/fracture/fractureComparison` no longer exports `FractureComparisonRow`, `compareFracture`, `formatFractureComparison`.
- `@jgengine/core/fracture/fragmentSize` no longer exports `FragmentSizes`, `GaudinSchuhmannFit`, `KWH_PER_TONNE`, `RosinRammlerFit`, `SizeFit`, `T10Fit`, `breakageProbability`, `fitGaudinSchuhmann` and 7 more.
- `@jgengine/core/fracture/rockFracture` no longer exports `BASALT_BREAKAGE`, `FractureOptions`, `FractureResult`, `GRANITE_BREAKAGE`, `LIMESTONE_BREAKAGE`, `ROCK_BREAKAGE`, `RockBreakage`, `RockFragment` and 4 more.
- `@jgengine/core/fracture/rockFractureGenerator` no longer exports `FRACTURE_GENERATORS`, `ROCK_FRACTURE_GENERATOR`, `ROCK_FRACTURE_SCHEMA`, `fragmentMesh`, `rockCell`.
- `@jgengine/core/granular/granularExperiments` no longer exports `ContinuumCollapse`, `FlumeFlow`, `PouredHeap`, `continuumCollapse`, `inclinedFlume`, `pouredHeap`.
- `@jgengine/core/physics/boatDynamics` no longer exports `BoatAddedMass`, `BoatDynamics`, `BoatEffects`, `BoatOptions`, `BoatState`, `BoatSteering`, `BoatStep`, `BoatTuning` and 2 more.
- `@jgengine/core/physics/boatManoeuvring` no longer exports `HullManoeuvring`, `ManoeuvringDerivatives`, `ManoeuvringLoads`, `ManoeuvringRudder`, `RudderInflow`, `hullManoeuvringForces`, `rudderForces`.
- `@jgengine/core/physics/boatPlaning` no longer exports `PlaningBottom`, `PlaningForces`, `planingForces`, `planingTrim`.
- `@jgengine/core/physics/boatPropeller` no longer exports `BoatEngine`, `BoatPropeller`, `PreparedOpenWater`, `PropellerOpenWater`, `PropellerPoint`, `prepareOpenWater`, `propellerPoint`.
- `@jgengine/core/physics/boatReferences` no longer exports `BOAT_REFERENCE_IDS`, `BoatOverrides`, `BoatReferenceId`, `boatFromReference`.
- `@jgengine/core/physics/boatResistance` no longer exports `BoatWater`, `FrictionLine`, `HullResistance`, `SEA_WATER_KINEMATIC_VISCOSITY`, `frictionLineCoefficient`, `prepareHullResistance`.
- `@jgengine/core/physics/boatSeakeeping` no longer exports `HullOffsetTable`, `HullSeakeeping`, `PreparedSeakeeping`, `SeakeepingExcitation`, `SeakeepingLoads`, `SectionRadiation`, `prepareSeakeeping`, `seakeepingExcitation` and 4 more.
- `@jgengine/core/physics/boatWindage` no longer exports `AIR_DENSITY`, `BoatWind`, `boatWindageForce`.
- `@jgengine/core/physics/flowTube` no longer exports `FlowTube`, `FlowTubeConfig`, `FlowVec3`, `combineFlowVelocity`, `createFlowTube`.
