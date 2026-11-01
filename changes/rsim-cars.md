the runtime car reproduces the reference: Magic Formula tyres with load sensitivity, weight transfer, drift feel, aero, rolling resistance, brake fade, suspension kinematics, torque curve and gearing and road friction, each a named effect with a 0-upward dial; carFromReference gives a real car in one line and a fleet is data

### Added

- the runtime car reproduces the reference: Magic Formula tyres with load sensitivity, weight transfer, drift feel, aero, rolling resistance, brake fade, suspension kinematics, torque curve and gearing and road friction, each a named effect with a 0-upward dial; carFromReference gives a real car in one line and a fleet is data
- `brakeFadeShare` (`@jgengine/core/physics/brakeFade`): The share of cold brake force the pads give at disc temperature `temperature` °C, with the fade scaled by `strength`. Also `VehicleBrakeFadeEffect`.
- `CAR_CLASS_IDS` (`@jgengine/core/physics/carReferences`): The vehicle classes. Also `CAR_REFERENCE_IDS`, `CAR_REFERENCE_VEHICLE_IDS`, `CarClassId`, `CarOverrides`, `CarReferenceId`, `CarReferenceVehicleId`, `carFromReference`.
- `engineTorque` (`@jgengine/core/physics/engineTorqueCurve`): Crank torque at `rpm` and pedal `pedal` (`0..1`), N·m: `pedal·T(rpm) − (1 − pedal)·friction(rpm)`, with the curve's dips and the friction scaled by `strength`. Also `VehicleTorqueCurveEffect`.
- `roadFrictionAt` (`@jgengine/core/physics/roadFriction`): The tyre-friction multiplier the road gives on surface `surface`, with its distance from the test track scaled by `strength`. Also `VehicleRoadFrictionEffect`.
- `TNO_205_60R15_TIRE` (`@jgengine/core/physics/tireMagicFormula`): The TNO 205/60 R15 passenger-car tyre (`TNO_car205_60R15.tir`, the set in Pacejka, *Tire and Vehicle Dynamics*, 3rd ed., 2012, Appendix 3), dry asphalt, 4000 N nominal load: μx ≈ 1.04, μy ≈ 0.88, about 53 kN/rad of cornering stiffness at nominal load. Also `MagicFormulaTireCoefficients`, `MagicFormulaWheelCurve`, `VehicleMagicFormulaEffect`, `magicFormulaTrail`, `magicFormulaWheel`.
- `ROAD_CAR_STEERING_COMPLIANCE` (`@jgengine/core/physics/vehicleAligningTorque`): Steering-system compliance of a road car's rack and column, road-wheel rad per N·m. Also `VehicleAligningTorqueEffect`, `aligningSteer`.
- `VehicleStepBrakes` (`@jgengine/core/physics/vehicleDynamics`): Brake telemetry of a {@link VehicleDynamicsStep}.
- `suspensionKinematics` (`@jgengine/core/physics/vehicleSuspensionKinematics`): Lateral load transfer, roll lever and camber gain for one lateral acceleration `ay` (m/s², either sign), blended from the simple split by `strength`. Also `SuspensionKinematicsLoads`, `VehicleSuspensionKinematicsEffect`.
- `crownBalanceLean` (`@jgengine/core/physics/vehicleTireCrown`): The balance lean, rad, that a bike rolled to `lean` runs at: the inverse of {@link crownShownLean}. Also `VehicleTireCrownEffect`.

### Changed

- Part of #2837
