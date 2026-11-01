the granular sand and soil model and its published-data experiments are back; a physical model checked against published data is engine ground truth and stays without a game adopter

### Added

- the granular sand and soil model and its published-data experiments are back; a physical model checked against published data is engine ground truth and stays without a game adopter
- `continuumCollapse` (`@jgengine/core/granular/granularExperiments`): Release a column of `aspect` = h_i / r_i, radius `radius` m, on a flat bed and measure the deposit. Also `ContinuumCollapse`, `FlumeFlow`, `PouredHeap`, `inclinedFlume`, `pouredHeap`.
- `createGranularLayer` (`@jgengine/core/granular/granularLayer`): Create a granular layer over a bedrock grid. Also `GranularLayer`, `GranularLayerConfig`, `GranularLayerSnapshot`, `GranularPressReport`, `GranularStepReport`.
- `DAMP_SAND` (`@jgengine/core/granular/granularMaterial`): Sand with about 1% water. Also `BekkerSoil`, `DRY_SAND`, `GLASS_BEADS`, `GRAVEL`, `GranularMaterial`, `SANDY_LOAM`, `culmannHeight`, `flowFriction` and 6 more.
- `createGranularTerrain` (`@jgengine/core/granular/granularTerrain`): Bind a granular layer to a terrain's vertex grid. Also `GranularTerrain`, `GranularTerrainOptions`, `LandformCoverPlacement`, `landformLooseCover`.

### Changed

- Rule: reference sims are the engine's physical ground truth, live in scripts/reference, run in CI, and need the published data they reproduce, not a game
- Part of #2837
