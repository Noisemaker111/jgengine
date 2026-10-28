fire/ surface spread from Rothermel 1972 with Albini 1976 corrections, matching BehavePlus test outputs to 1e-6

### Added

- fire/ surface spread from Rothermel 1972 with Albini 1976 corrections, matching BehavePlus test outputs to 1e-6
- the 40 Scott & Burgan 2005 fuel models, the 13 Anderson models, non-burnable codes and the 16 moisture scenarios
- wind adjustment to midflame, Anderson 1983 fire ellipse, Byram fireline intensity and flame length, Van Wagner scorch height
- `ANDERSON_FUEL_MODELS` (`@jgengine/core/fire/fuelModels`): The original 13 fuel models (Anderson 1982; Albini 1976), keyed by code `FM1`..`FM13`. Also `FuelLoads`, `FuelModel`, `FuelMoisture`, `KG_M2_PER_LB_FT2`, `KG_M2_PER_TON_ACRE`, `KJ_KG_PER_BTU_LB`, `MOISTURE_SCENARIOS`, `M_PER_FT` and 4 more.
- `KW_M_PER_BTU_FT_S` (`@jgengine/core/fire/surfaceFire`): kW/m per Btu/ft/s. Also `MPS_PER_MPH`, `SpreadConditions`, `SurfaceFuelbed`, `SurfaceSpread`, `WindLimit`, `curedHerbFraction`, `ellipseEccentricity`, `firelineIntensity` and 8 more.
- `twentyFootWind` (`@jgengine/core/fire/windAdjustment`): 20-ft wind from a 10-m wind: divide by 1.15 (Turner & Lawson 1978, as in BehavePlus). Also `CanopyShelter`, `windAdjustmentFactor`.

### Changed

- Part of #2741

### Removed

- `@jgengine/core/plants/validation/stemAllometry` no longer exports `BAAD_LEAF_TO_SAPWOOD`, `FIA_STAND_DIAMETER`, `LeafToSapwoodBand`, `StandDiameterAtAge`.
