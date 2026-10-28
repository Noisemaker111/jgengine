a plant growth simulator in core/plants: Acer saccharum grows from seed to 400 years with a seeded biology model (bud self-organisation on shadow voxels, LIGNUM carbon balance, pipe model, tropisms, sag, self-pruning) that gives the same tree in bun and Chrome

### Added

- a plant growth simulator in core/plants: Acer saccharum grows from seed to 400 years with a seeded biology model (bud self-organisation on shadow voxels, LIGNUM carbon balance, pipe model, tropisms, sag, self-pruning) that gives the same tree in bun and Chrome
- plant species records as plain data with credited sources, a structure builder (skeleton with regions, bark distance, leaves, clusters, crown envelope) and the Carmean 1989 sugar maple height curve to validate against
- a 400-year plant growth row in bun run perf timing
- the plant light field can snapshot and restore its grids
- `ShootCandidates` (`@jgengine/core/plants/growth/carbonBalance`): Growth candidates for one year: every bud that could extend, with its Borchert–Honda share of the tree's vigour and its carbon cost per metamer. Also `StructureCost`.
- `NODE_AXIS_START` (`@jgengine/core/plants/growth/growthState`): Node flag: first internode of a lateral axis (a branch base). Also `GrowthState`, `NODE_DEAD`, `NODE_FIELDS`, `NODE_NO_SPUR`, `NODE_SCAR`, `SCALAR_FIELDS`.
- `LightField` (`@jgengine/core/plants/growth/lightField`): Relative light (0..1 of open sky) and the least-shaded direction at a point. Also `LightFieldSnapshot`.
- `GrowingSeason` (`@jgengine/core/plants/growth/phenology`): The leaf-on window of one year and the radiation it collects.
- `PipeCost` (`@jgengine/core/plants/growth/pipeModel`): {@link StructureCost} rebuilt each year from the current foliage.
- `OPEN_TEMPERATE_SITE` (`@jgengine/core/plants/growth/plantEnvironment`): A temperate, well-watered, fertile open site at 45° N: the site Carmean's curves describe. Also `PlantEnvironment`.
- `DEFAULT_GROWTH_LIMITS` (`@jgengine/core/plants/growth/plantGrowth`): Most buds and nodes a plant may hold: 4000 and 60000. Also `GrowthLimits`, `PLANT_SIM_VERSION`, `PlantGrowth`, `PlantGrowthSnapshot`, `PlantGrowthStats`, `createPlantGrowth`.
- `PLANT_PI` (`@jgengine/core/plants/growth/plantMath`): π to double precision.
- `TropismWeights` (`@jgengine/core/plants/growth/tropism`): The weights Palubicki et al.
- `ACER_SACCHARUM` (`@jgengine/core/plants/species/data/acerSaccharum`): Sugar maple.
- `plantSpeciesById` (`@jgengine/core/plants/species/plantSpecies`): A registered species, or undefined. Also `BarkKind`, `HalleOldemanModel`, `LeafShapeParams`, `PlantSpecies`, `SeasonalColor`, `plantSpeciesIds`, `registerPlantSpecies`, `validatePlantSpecies`.
- `PLANT_SOURCES` (`@jgengine/core/plants/species/speciesSources`): Every source a plant species value or growth rule comes from; each one is credited in CREDITS.md. Also `PlantSourceId`.
- `CROWN_HULL_BINS` (`@jgengine/core/plants/structure/plantStructure`): Height bins and azimuth sectors of {@link PlantStructure.crownHull}. Also `CROWN_HULL_SECTORS`, `PLANT_CLUSTER_LEVELS`, `PLANT_ORGAN`, `PLANT_REGION`, `PlantClusterLevel`, `PlantRegion`, `PlantStructure`, `PlantStructureSource` and 3 more.
- `SUGAR_MAPLE_CARMEAN` (`@jgengine/core/plants/validation/heightAgeCurves`): NC-128 curve 3: sugar maple, northern Wisconsin and Upper Michigan (Carmean 1978), total age. Also `SiteIndexCurve`, `siteIndexHeightM`.

### Changed

- Part of #2699
