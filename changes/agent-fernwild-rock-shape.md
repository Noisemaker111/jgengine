the rock generator's smooth shading draws a stone rounded instead of as flat low-poly triangles, and its crags param cuts cracks and stacked ledges into it

Refs #2687

Engine seam: packages/core/src/nature/natureGenerators.ts, packages/core/src/nature/natureMesh.ts

### Added

- the rock generator's smooth shading draws a stone rounded instead of as flat low-poly triangles, and its crags param cuts cracks and stacked ledges into it

### Changed

- Fernwild's rocks, boulders and pebbles are rounded and craggy, as ARK draws rock

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
- `@jgengine/core/movement/reference/compareRagdollFall` no longer exports `INJURY_LIMITS`, `RagdollFallOptions`, `RagdollFallRow`, `compareRagdollFall`, `formatRagdollFall`, `humanRagdollConfig`, `measureRagdollFall`, `stockHumanoidRagdoll`.
- `@jgengine/core/movement/reference/humanFall` no longer exports `FallOptions`, `FallReport`, `FallTone`, `HEAD_ON_FLOOR`, `PELVIS_ON_FLOOR`, `simulateFall`, `validateHumanFall`.
- `@jgengine/core/movement/reference/quadrupedGait` no longer exports `ALEXANDER_JAYES_CURSORIAL`, `CreatureLocomotion`, `FroudePowerLaw`, `MAMMAL_TOP_SPEEDS`, `QUADRUPED_GAIT_TRANSITIONS`, `QuadrupedBody`, `QuadrupedComparison`, `QuadrupedGait` and 8 more.
- `@jgengine/core/physics/reference/bondedRock` no longer exports `BASALT`, `BEREA_SANDSTONE`, `BondedRockModel`, `BondedSpecimen`, `BrazilianResult`, `CalibrationResult`, `GrainPacking`, `INDIANA_LIMESTONE` and 15 more.
- `@jgengine/core/physics/reference/discreteElementExperiments` no longer exports `ColumnCollapseOptions`, `ColumnCollapseResult`, `DEM_GLASS_BEADS`, `DEM_SAND`, `DEM_STEEL`, `HopperOptions`, `HopperResult`, `JanssenFit` and 17 more.
- `@jgengine/core/physics/reference/discreteElements` no longer exports `DemBodySpec`, `DemBondLoad`, `DemBondSpec`, `DemInteraction`, `DemLiquid`, `DemMaterial`, `DemSnapshot`, `DemSphereSpec` and 11 more.
