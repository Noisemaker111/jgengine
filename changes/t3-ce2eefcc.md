a reference 6-DOF flight model in flight/reference: quaternion rigid body, RK4 (error falls about 19x per halved step), US Standard Atmosphere 1976, a wind hook, coefficient tables, and gear with struts, brakes and nosewheel steering

### Added

- a reference 6-DOF flight model in flight/reference: quaternion rigid body, RK4 (error falls about 19x per halved step), US Standard Atmosphere 1976, a wind hook, coefficient tables, and gear with struts, brakes and nosewheel steering
- the F-16 from NASA TP-1538 matches the Stevens & Lewis check case within 0.02%, its trim within 0.2% and its published modes within 1%
- a Cessna 172 with a blade-element propeller and O-320 engine, within the 172N handbook: stall 0%, top speed +4%, climb +10%, take-off roll +21% (the chart is flaps 10°)
- runFlightTests flies stall, top speed, climb, roll, sustained turn and take-off on the reference or a game RigidAircraft; bun run perf flight [game] prints game / reference / real per aircraft
- `linearizeReferenceAircraft` (`@jgengine/core/flight/reference/aircraftTrim`): Linearizes a reference aircraft about a trim point by central differences of the wind-axis equations, with propulsion and actuator states held, and names the classical modes: short period and phugoid from the longitudinal matrix, dutch roll, roll subsidence and spiral from the lateral one. Also `Eigenvalue`, `FlightLinearization`, `FlightMode`, `TrimCondition`, `TrimResult`, `WindAxisState`, `matrixEigenvalues`, `referenceStateFromWindAxes` and 3 more.
- `C172_PROPELLER` (`@jgengine/core/flight/reference/cessna172Aircraft`): McCauley 1C160/DTM7553 fixed-pitch propeller: 75 in diameter, 53 in geometric pitch, two blades. Also `createCessna172Model`.
- `createCoefficientTable` (`@jgengine/core/flight/reference/coefficientTable`): Creates a gridded {@link CoefficientTable}, the form aerodynamic data comes in (alpha by beta by Mach by deflection). Also `CoefficientTable`, `CoefficientTableAxis`, `evenBreakpoints`.
- `STEVENS_LEWIS_GRAVITY` (`@jgengine/core/flight/reference/f16Aircraft`): Stevens & Lewis gravity, 32.17 ft/s², in m/s². Also `F16ModelOptions`, `createF16Model`, `f16PowerCommand`, `f16Thrust`, `stevensLewisAtmosphere`.
- `CESSNA_172N_PUBLISHED` (`@jgengine/core/flight/reference/flightComparison`): Cessna 172N figures from its Pilot's Operating Handbook (1978) at 2300 lb, sea level, standard day: stall 50 KCAS flaps up, top speed 125 KTAS, climb 770 ft/min at 73 KIAS, take-off ground roll 805 ft (the chart is flaps 10°). Also `FlightComparison`, `FlightComparisonAircraft`, `FlightComparisonRow`, `PublishedFlightFigures`, `compareFlight`, `formatFlightComparison`.
- `KNOTS_PER_MPS` (`@jgengine/core/flight/reference/flightTests`): Knots in one m/s. Also `FlightTestControls`, `FlightTestOptions`, `FlightTestReport`, `FlightTestSample`, `FlightTestSubject`, `referenceFlightSubject`, `rigidAircraftFlightSubject`, `runFlightTests`.
- `clarkYPropellerSection` (`@jgengine/core/flight/reference/propeller`): The section data of a flat-bottomed propeller airfoil in the Clark Y family: a thin-airfoil lift slope corrected by Prandtl–Glauert up to Mach 0.7, zero lift at −4° to the flat lower surface, a stall near `cl = 1.2` that falls to flat-plate lift, a parabolic drag bucket, Lock's compressibility drag rise past a critical Mach that drops as the section thickens toward the hub, and flat-plate drag past the stall. Also `BladeSection`, `PropellerGeometry`, `PropellerMap`, `createPropellerMap`, `solvePropeller`.
- `createReferenceAircraft` (`@jgengine/core/flight/reference/referenceAircraft`): Creates a {@link ReferenceAircraft}: a flat, non-rotating Earth 6-DOF rigid body with quaternion attitude, a full inertia tensor (with the `Ixz` product) plus gyroscopic engine momentum, gravity falling off with altitude, an injected atmosphere and wind, the α̇ aerodynamic terms solved implicitly, first-order rate-limited actuators, propulsion states, and spring-damper gear with tyre friction. Also `ReferenceActuator`, `ReferenceAeroCoefficients`, `ReferenceAirData`, `ReferenceAircraft`, `ReferenceAircraftModel`, `ReferenceAircraftOptions`, `ReferenceAircraftSample`, `ReferenceAircraftState` and 11 more.
- `SEA_LEVEL_DENSITY` (`@jgengine/core/flight/reference/standardAtmosphere`): Sea-level standard density, kg/m³. Also `AtmosphereModel`, `AtmosphereSample`, `SEA_LEVEL_PRESSURE`, `SEA_LEVEL_SPEED_OF_SOUND`, `STANDARD_EARTH_RADIUS`, `STANDARD_GRAVITY`, `calibratedAirspeed`, `geopotentialAltitude` and 2 more.

### Changed

- Part of #2698

### Fixed

- two data errors common in copied F-16 table ports (corrupted CL rows at beta 5-15°, alpha 15-25°, and idle thrust -170 for -710 at Mach 0.6); this uses the book values
