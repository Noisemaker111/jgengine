fire/ landscape solver: Finney 2002 minimum-travel-time spread with crown fire, ember spotting and burnout

### Added

- fire/ landscape solver: Finney 2002 minimum-travel-time spread with a triangle update, on fuel, terrain and canopy grids, with snapshot, restore, reset and retune
- crown fire from Van Wagner 1977 and Rothermel 1991, matching BehavePlus crown outputs to 1e-6
- Albini ember spotting from surface fires and torching trees with Chase's ridge-valley correction, and NFDRS ember ignition probability
- per-cell burn state, flaming and smouldering burnout, char, ash, scorch height and fuel left for renderers
- `CANOPY_HEAT_KJ_KG` (`@jgengine/core/fire/crownFire`): Low heat of combustion of crown foliage, kJ/kg (8000 Btu/lb, as BehavePlus). Also `CanopyFuel`, `CrownFire`, `CrownFireType`, `activeCrownCriticalRate`, `assessCrownFire`, `canopyFuelLoad`, `crownFlameLength`, `crownInitiationIntensity` and 2 more.
- `DEFAULT_FIRE_TUNING` (`@jgengine/core/fire/fireLandscape`): Defaults: 16-direction stencil, BehavePlus-default wind limit, crown fire and spotting on. Also `CanopyStand`, `FireBurnState`, `FireCellKind`, `FireCellReading`, `FireLandscape`, `FireLandscapeConfig`, `FireLandscapeSnapshot`, `FireLayers` and 5 more.
- `emberIgnitionProbability` (`@jgengine/core/fire/spotting`): Probability that a firebrand landing in fine dead fuel starts a fire (Schroeder 1969, in the NFDRS form of Cohen & Deeming 1985): from 1-h fuel moisture and the fuel's temperature, 0..1. Also `SpotDistance`, `SpotTerrain`, `TorchingSpecies`, `surfaceFireSpotDistance`, `torchingTreeSpotDistance`.

### Changed

- Part of #2741
