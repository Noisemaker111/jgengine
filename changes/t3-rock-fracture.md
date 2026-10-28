rocks that break by impact: parallel bonds in the DEM reference, a bonded-rock reference calibrated to four real rocks, and fracture/ for games

### Added

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
- `BASALT` (`@jgengine/core/physics/reference/bondedRock`): Basalt: ρ 2900 kg/m³, E 70 GPa (reported 50–90), σ_t 14 MPa. Also `BEREA_SANDSTONE`, `BondedRockModel`, `BondedSpecimen`, `BrazilianResult`, `CalibrationResult`, `GrainPacking`, `INDIANA_LIMESTONE`, `ImpactOptions` and 14 more.
- `DemBondSpec`, `DemBondLoad` (`@jgengine/core/physics/reference/discreteElements`): parallel bond spec and load; `DiscreteElements` gains `bond`, `bondTouching`, `bondLoad`, `bondCount`, `bondEnds`, `bondIntact`.

### Changed

- Part of #2768
