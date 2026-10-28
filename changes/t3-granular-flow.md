a discrete element reference for sand and gravel (physics/reference/discreteElements.ts): spheres and clumps, Hertz–Mindlin contacts, rolling resistance and capillary cohesion; deterministic, with snapshot and restore

### Added

- a discrete element reference for sand and gravel (physics/reference/discreteElements.ts): spheres and clumps, Hertz–Mindlin contacts, rolling resistance and capillary cohesion; deterministic, with snapshot and restore
- experiments that check it against published values: restitution, dry and damp angle of repose, Janssen silo saturation, Beverloo hopper discharge and the Brazil-nut effect
- granular/ — loose sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield: a depth-averaged flow with the Pouliquen–Forterre friction law, Culmann cohesive banks and Bekker pressure–sinkage, costing only the cells that move
- createGranularTerrain binds it to an EditableTerrain, writing every change back as a TerraformDelta; landformLooseCover reads loose depth and material from a landform's cover
- collapsedColumn, a DEM column collapse the continuum is calibrated against, with Lube et al. (2004) and Pouliquen (1999) flume checks
- `continuumCollapse` (`@jgengine/core/granular/granularExperiments`): Release a column of `aspect` = h_i / r_i, radius `radius` m, on a flat bed and measure the deposit. Also `ContinuumCollapse`, `FlumeFlow`, `PouredHeap`, `inclinedFlume`, `pouredHeap`.
- `createGranularLayer` (`@jgengine/core/granular/granularLayer`): Create a granular layer over a bedrock grid. Also `GranularLayer`, `GranularLayerConfig`, `GranularLayerSnapshot`, `GranularPressReport`, `GranularStepReport`.
- `DAMP_SAND` (`@jgengine/core/granular/granularMaterial`): Sand with about 1% water. Also `BekkerSoil`, `DRY_SAND`, `GLASS_BEADS`, `GRAVEL`, `GranularMaterial`, `SANDY_LOAM`, `culmannHeight`, `flowFriction` and 6 more.
- `createGranularTerrain` (`@jgengine/core/granular/granularTerrain`): Bind a granular layer to a terrain's vertex grid. Also `GranularTerrain`, `GranularTerrainOptions`, `LandformCoverPlacement`, `landformLooseCover`.
- `DEM_GLASS_BEADS` (`@jgengine/core/physics/reference/discreteElementExperiments`): Soda-lime glass beads: restitution 0.97 and friction 0.092 measured by Foerster, Louge, Chang & Allia (1994). Also `ColumnCollapseOptions`, `ColumnCollapseResult`, `DEM_SAND`, `DEM_STEEL`, `HopperOptions`, `HopperResult`, `JanssenFit`, `PouredConeOptions` and 16 more.
- `bridgeRuptureDistance` (`@jgengine/core/physics/reference/discreteElements`): Gap at which a bridge breaks (Lian et al. Also `DemBodySpec`, `DemInteraction`, `DemLiquid`, `DemMaterial`, `DemSnapshot`, `DemSphereSpec`, `DemStepReport`, `DemWallMotion` and 8 more.

### Changed

- Part of #2768
- DEM sand rolling resistance 0.6 to 0.7 and the repose test averages three heaps, so platform rounding no longer moves it out of band
