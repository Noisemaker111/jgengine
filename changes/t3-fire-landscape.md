fire/ surface spread from Rothermel 1972 with Albini 1976 corrections, matching BehavePlus test outputs to 1e-6

### Added

- fire/ surface spread from Rothermel 1972 with Albini 1976 corrections, matching BehavePlus test outputs to 1e-6
- the 40 Scott & Burgan 2005 fuel models, the 13 Anderson models, non-burnable codes and the 16 moisture scenarios
- wind adjustment to midflame, Anderson 1983 fire ellipse, Byram fireline intensity and flame length, Van Wagner scorch height
- fire/ landscape solver: Finney 2002 minimum-travel-time spread with a triangle update, on fuel, terrain and canopy grids, with snapshot, restore, reset and retune
- crown fire from Van Wagner 1977 and Rothermel 1991, matching BehavePlus crown outputs to 1e-6
- Albini ember spotting from surface fires and torching trees with Chase's ridge-valley correction, and NFDRS ember ignition probability
- per-cell burn state, flaming and smouldering burnout, char, ash, scorch height and fuel left for renderers
- `CANOPY_HEAT_KJ_KG` (`@jgengine/core/fire/crownFire`): Low heat of combustion of crown foliage, kJ/kg (8000 Btu/lb, as BehavePlus). Also `CanopyFuel`, `CrownFire`, `CrownFireType`, `activeCrownCriticalRate`, `assessCrownFire`, `canopyFuelLoad`, `crownFlameLength`, `crownInitiationIntensity` and 2 more.
- `DEFAULT_FIRE_TUNING` (`@jgengine/core/fire/fireLandscape`): Defaults: 16-direction stencil, BehavePlus-default wind limit, crown fire and spotting on. Also `CanopyStand`, `FireBurnState`, `FireCellKind`, `FireCellReading`, `FireLandscape`, `FireLandscapeConfig`, `FireLandscapeSnapshot`, `FireLayers` and 5 more.
- `ANDERSON_FUEL_MODELS` (`@jgengine/core/fire/fuelModels`): The original 13 fuel models (Anderson 1982; Albini 1976), keyed by code `FM1`..`FM13`. Also `FuelLoads`, `FuelModel`, `FuelMoisture`, `KG_M2_PER_LB_FT2`, `KG_M2_PER_TON_ACRE`, `KJ_KG_PER_BTU_LB`, `MOISTURE_SCENARIOS`, `M_PER_FT` and 4 more.
- `emberIgnitionProbability` (`@jgengine/core/fire/spotting`): Probability that a firebrand landing in fine dead fuel starts a fire (Schroeder 1969, in the NFDRS form of Cohen & Deeming 1985): from 1-h fuel moisture and the fuel's temperature, 0..1. Also `SpotDistance`, `SpotTerrain`, `TorchingSpecies`, `surfaceFireSpotDistance`, `torchingTreeSpotDistance`.
- `KW_M_PER_BTU_FT_S` (`@jgengine/core/fire/surfaceFire`): kW/m per Btu/ft/s. Also `MPS_PER_MPH`, `SpreadConditions`, `SurfaceFuelbed`, `SurfaceSpread`, `WindLimit`, `curedHerbFraction`, `ellipseEccentricity`, `firelineIntensity` and 8 more.
- `twentyFootWind` (`@jgengine/core/fire/windAdjustment`): 20-ft wind from a 10-m wind: divide by 1.15 (Turner & Lawson 1978, as in BehavePlus). Also `CanopyShelter`, `windAdjustmentFactor`.

### Changed

- Part of #2741
