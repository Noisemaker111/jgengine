createReferenceCar, a multibody reference car in physics/reference: Kane's equations for body and four corners, exact double-wishbone and MacPherson kinematics, bushing and steering compliance, Karnopp clutch and brakes, engine inertia, plate-LSD or Torsen differential, compliant halfshafts, RK4 at 0.5 ms

Closes #2698

### Added

- createReferenceCar, a multibody reference car in physics/reference: Kane's equations for body and four corners, exact double-wishbone and MacPherson kinematics, bushing and steering compliance, Karnopp clutch and brakes, engine inertia, plate-LSD or Torsen differential, compliant halfshafts, RK4 at 0.5 ms
- solveSuspension and createSuspensionTable, suspension kinematics from hardpoints (camber, toe, track and spring length through travel and steer)
- REAL_CARS (Mazda MX-5 ND, Scion FR-S) with cited specs and published tests; both land within 2.1% on 0-100 and braking and 0.03 g on the skidpad
- measureStandardManeuvers, ISO 4138 steady-state circle, ISO 7401 step steer and ISO 3888-1 lane change for any vehicle sim
- compareVehicleTuning and bun run games:capabilities handling, which score game cars against the reference car and a real car's published numbers; --validate checks the reference cars themselves
- `PUBLISHED_TOLERANCES` (`@jgengine/core/physics/reference/compareHandling`): How close the reference car must land to each published number: 0–100 km/h and 100–0 km/h braking within 5%, skidpad within 0.03 g. Also `ComparableHandlingMetrics`, `ComparableHandlingOptions`, `HandlingComparisonRow`, `PublishedCheck`, `VehicleHandlingComparison`, `checkReferenceAgainstPublished`, `compareHandlingMetrics`, `compareVehicleTuning` and 4 more.
- `magicFormulaContact` (`@jgengine/core/physics/reference/magicFormulaTire`): The transient contact of {@link createMagicFormulaTire} as a pure right-hand side, for a caller that integrates the deflections itself (a multibody car's ODE): forces from the current deflections and the deflection rates `du/dt = −Vsx − |Vx|·u/σκ`, `dv/dt = Vsy − |Vx|·v/σα`, `dφ′/dt = |Vx|·(φ − φ′)/σα`. Also `MagicFormulaContactState`.
- `MAZDA_MX5_ND` (`@jgengine/core/physics/reference/realCars`): 2016 Mazda MX-5 Miata Club (ND, 2.0 L, six-speed manual, limited-slip differential): light, 50:50, rear drive. Also `REAL_CARS`, `RealCar`, `RealCarTestData`, `SCION_FRS_2013`.
- `createReferenceCar` (`@jgengine/core/physics/reference/referenceCar`): Creates a {@link ReferenceCar}: a multibody car integrated with classical fourth-order Runge–Kutta (default 0.5 ms; halving the step converges at fourth order between control samples) and a 1 kHz driver/controller sample. Also `ReferenceAero`, `ReferenceAxle`, `ReferenceBrakes`, `ReferenceCar`, `ReferenceCarOptions`, `ReferenceCarSpec`, `ReferenceCarState`, `ReferenceCarStep` and 6 more.
- `measureStandardManeuvers` (`@jgengine/core/physics/reference/standardManeuvers`): Runs the standard handling tests on fresh vehicles from `create`: ISO 4138 steady-state circular driving (constant radius), ISO 7401 step steer, and the ISO 3888-1 double lane change. Also `StandardManeuver`, `StandardManeuverOptions`, `StandardManeuverReport`.
- `createSuspensionSample` (`@jgengine/core/physics/reference/suspensionKinematics`): An empty {@link SuspensionSample} to reuse with {@link SuspensionTable.sample}. Also `DoubleWishboneGeometry`, `MacPhersonGeometry`, `SuspensionGeometry`, `SuspensionPoint`, `SuspensionPose`, `SuspensionSample`, `SuspensionTable`, `createSuspensionTable` and 1 more.

### Fixed

- the Magic Formula tyre rolling backward now mirrors the slip, so friction opposes sliding in reverse (a parked car used to creep)
