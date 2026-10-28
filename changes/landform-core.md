a landform simulator in core/landform grows terrain from tectonic uplift, river incision (implicit Braun & Willett solver), lakes, sediment fans and lake fill, hillslope creep, landslides with talus at the angle of repose, and tilted rock strata with their own hardness

### Added

- a landform simulator in core/landform grows terrain from tectonic uplift, river incision (implicit Braun & Willett solver), lakes, sediment fans and lake fill, hillslope creep, landslides with talus at the angle of repose, and tilted rock strata with their own hardness
- geomorphic law measurements (Flint's slope-area law, Hack's law) that test the simulated terrain; at steady state concavity is 0.500 and steepness matches (U/K)^(1/n), and Hack's exponent is about 0.6
- `DEFAULT_LANDFORM_PARAMS` (`@jgengine/core/landform/evolution/landscapeEvolution`): Sensible defaults for a 100 m grid: 1 mm/yr uplift, K = 2·10⁻⁵, m = 0.5, n = 1 (concavity 0.5), D = 0.01 m²/yr, repose 34°, 10 kyr steps. Also `LandformFields`, `LandformInitial`, `LandformParams`, `LandformSnapshot`, `LandformStepReport`, `LandscapeEvolution`, `LandscapeEvolutionOptions`, `createLandscapeEvolution` and 1 more.
- `UNIFORM_ROCK` (`@jgengine/core/landform/evolution/rockStrata`): The default single rock: uniform, standing at 45°. Also `LandformStrata`, `RockLayer`.
- `dInfinityArea` (`@jgengine/core/landform/flow/dInfinity`): D∞ upstream area per cell in m² over a depression-free `surface`, weighted by `rainfall` when given.
- `FLAT_RISE` (`@jgengine/core/landform/flow/flowRouting`): Rise per cell across filled flats, in metres; small next to any relief, large next to rounding. Also `FlowRouting`.
- `D8_DCOL` (`@jgengine/core/landform/grid/landformGrid`): Column offsets of the D8 neighbours: east, south-east, south, south-west, west, north-west, north, north-east. Also `D8_DROW`, `LANDFORM_MAX_SIDE`, `LandformEdge`, `LandformGrid`.
- `fitPowerLaw` (`@jgengine/core/landform/validation/geomorphicLaws`): Fit y = c · x^e by least squares on log x, log y over the points where both are positive. Also `ChannelSelection`, `PowerLawFit`, `hackLawFit`, `slopeAreaFit`, `upstreamLength`.

### Changed

- Part of #2742

### Removed

- `@jgengine/core/plants/validation/stemAllometry` no longer exports `BAAD_LEAF_TO_SAPWOOD`, `FIA_STAND_DIAMETER`, `LeafToSapwoodBand`, `StandDiameterAtAge`.
