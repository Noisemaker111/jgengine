a sugar maple grows from seed to 400 years in about 3.6 s, down from 6.4 s. Passes are fused, the growth solve walks only nodes with spare sapwood, the bud threshold uses a quickselect, and the light field and pipe cost are classes so many live plants stay fast

Root cause: the post-cap decline came from tips frozen at the bud cap, leaf ages reset when nodes merged, and the hydraulic limit zeroing photosynthesis at maximum height

### Migrate

- PLANT_SIM_VERSION is 2, so version 1 plant snapshots no longer restore; grow them again

### Added

- the remaining crown retrenchment after about 300 years is documented as veteran-tree behaviour (Fay 2002; Lonsdale 2013)
- the cross-engine test now grows 160 years, past the bud cap

### Changed

- Part of #2699

### Fixed

- a sugar maple grows from seed to 400 years in about 3.6 s, down from 6.4 s. Passes are fused, the growth solve walks only nodes with spare sapwood, the bud threshold uses a quickselect, and the light field and pipe cost are classes so many live plants stay fast
- old crowns no longer freeze at the bud cap and starve. Leaf cohorts keep their age through merges, gas exchange keeps half its rate at the height limit (Koch et al. 2004), and lateral tips that keep losing at the cap give their slot away (Sachs & Novoplansky 1995)

### Removed

- `@jgengine/core/flight/reference/aircraftTrim` no longer exports `Eigenvalue`, `FlightLinearization`, `FlightMode`, `TrimCondition`, `TrimResult`, `WindAxisState`, `linearizeReferenceAircraft`, `matrixEigenvalues` and 6 more.
- `@jgengine/core/flight/reference/bo105Helicopter` no longer exports `BO105_DESIGN`, `BO105_FORWARD_FLIGHT_DATA`, `BO105_HOVER_DATA`, `BO105_MAIN_ROTOR`, `BO105_TAIL_ROTOR`, `BO105_TUNNEL_AIR`, `createBo105Model`.
- `@jgengine/core/flight/reference/cessna172Aircraft` no longer exports `C172_PROPELLER`, `createCessna172Model`.
- `@jgengine/core/flight/reference/coefficientTable` no longer exports `CoefficientTable`, `CoefficientTableAxis`, `createCoefficientTable`, `evenBreakpoints`.
- `@jgengine/core/flight/reference/f16Aircraft` no longer exports `F16ModelOptions`, `STEVENS_LEWIS_GRAVITY`, `createF16Model`, `f16CycleEngine`, `f16PowerCommand`, `f16Thrust`, `stevensLewisAtmosphere`.
- `@jgengine/core/flight/reference/flightComparison` no longer exports `CESSNA_172N_PUBLISHED`, `ComparisonTable`, `FlightComparison`, `FlightComparisonAircraft`, `FlightComparisonRow`, `PublishedFlightFigures`, `compareFlight`, `formatFlightComparison`.
- `@jgengine/core/flight/reference/flightTests` no longer exports `FlightTestControls`, `FlightTestOptions`, `FlightTestReport`, `FlightTestSample`, `FlightTestSubject`, `KNOTS_PER_MPS`, `referenceFlightSubject`, `rigidAircraftFlightSubject` and 1 more.
- `@jgengine/core/flight/reference/gasTurbine` no longer exports `GasModel`, `GasStream`, `GasTurbineComponents`, `GasTurbineCycle`, `GasTurbineDesign`, `GasTurbineFlight`, `GasTurbinePoint`, `InletKind` and 4 more.
- `@jgengine/core/flight/reference/gasTurbineEngine` no longer exports `GasTurbineCommand`, `GasTurbineEngine`, `GasTurbineEngineOptions`, `GasTurbineEngineOutput`, `createGasTurbineEngine`, `gasTurbinePropulsion`.
- `@jgengine/core/flight/reference/helicopter` no longer exports `HelicopterDesign`, `HelicopterModel`, `HelicopterModelOptions`, `HelicopterRotorTelemetry`, `HelicopterSurface`, `HelicopterTrim`, `HelicopterTrimCondition`, `createHelicopterModel` and 1 more.
- `@jgengine/core/flight/reference/helicopterRotor` no longer exports `IsolatedRotorCondition`, `IsolatedRotorTrim`, `RotorDesign`, `RotorFlow`, `RotorLoads`, `RotorPitch`, `createRotorLoads`, `evaluateRotor` and 6 more.
- `@jgengine/core/flight/reference/jetEngineComparison` no longer exports `JetComparison`, `JetComparisonAircraft`, `JetComparisonRow`, `compareJetEngines`.
- `@jgengine/core/flight/reference/propeller` no longer exports `BladeSection`, `PropellerGeometry`, `PropellerMap`, `clarkYPropellerSection`, `createPropellerMap`, `solvePropeller`.
- `@jgengine/core/flight/reference/referenceAircraft` no longer exports `ReferenceActuator`, `ReferenceAeroCoefficients`, `ReferenceAirData`, `ReferenceAircraft`, `ReferenceAircraftModel`, `ReferenceAircraftOptions`, `ReferenceAircraftSample`, `ReferenceAircraftState` and 12 more.
- `@jgengine/core/flight/reference/referenceEngines` no longer exports `F100_PW_220`, `F100_PW_220_DYNAMICS`, `F100_PW_220_PUBLISHED`, `MATTINGLY_LEVEL_3`, `MATTINGLY_LEVEL_4`, `V2500_A1`, `V2500_A1_PUBLISHED`.
- `@jgengine/core/flight/reference/rotorcraftComparison` no longer exports `RotorcraftComparison`, `RotorcraftComparisonAircraft`, `RotorcraftComparisonRow`, `compareRotorcraft`.
- `@jgengine/core/flight/reference/standardAtmosphere` no longer exports `AtmosphereModel`, `AtmosphereSample`, `SEA_LEVEL_DENSITY`, `SEA_LEVEL_PRESSURE`, `SEA_LEVEL_SPEED_OF_SOUND`, `STANDARD_EARTH_RADIUS`, `STANDARD_GRAVITY`, `calibratedAirspeed` and 3 more.
