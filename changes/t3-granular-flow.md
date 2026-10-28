granular/ — loose sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield

### Added

- granular/ — loose sand, gravel and soil that pile, avalanche, dig, compact and rut on a heightfield: a depth-averaged flow with the Pouliquen–Forterre friction law, Culmann cohesive banks and Bekker pressure–sinkage, costing only the cells that move
- createGranularTerrain binds it to an EditableTerrain, writing every change back as a TerraformDelta; landformLooseCover reads loose depth and material from a landform's cover
- collapsedColumn, a DEM column collapse the continuum is calibrated against, with Lube et al. (2004) and Pouliquen (1999) flume checks
- `continuumCollapse` (`@jgengine/core/granular/granularExperiments`): Release a column of `aspect` = h_i / r_i, radius `radius` m, on a flat bed and measure the deposit. Also `ContinuumCollapse`, `FlumeFlow`, `PouredHeap`, `inclinedFlume`, `pouredHeap`.
- `createGranularLayer` (`@jgengine/core/granular/granularLayer`): Create a granular layer over a bedrock grid. Also `GranularLayer`, `GranularLayerConfig`, `GranularLayerSnapshot`, `GranularPressReport`, `GranularStepReport`.
- `DAMP_SAND` (`@jgengine/core/granular/granularMaterial`): Sand with about 1% water. Also `BekkerSoil`, `DRY_SAND`, `GLASS_BEADS`, `GRAVEL`, `GranularMaterial`, `SANDY_LOAM`, `culmannHeight`, `flowFriction` and 6 more.
- `createGranularTerrain` (`@jgengine/core/granular/granularTerrain`): Bind a granular layer to a terrain's vertex grid. Also `GranularTerrain`, `GranularTerrainOptions`, `LandformCoverPlacement`, `landformLooseCover`.

### Changed

- Part of #2768
