### Migrate

- There is one car sim: `createKinematicVehicle` (`physics/kinematicVehicle`) and `createVehicleBody` (`physics/vehicleBody`) are gone. Describe a car with `VehicleSpec` and drive it with `createVehicleDynamics(vehicleTuning(spec), options)` (`@jgengine/core/physics/vehicleSpec`, `@jgengine/core/physics/vehicleDynamics`, both on `@jgengine/core/world`). Map `engineAccel` → `accel`, `brakeAccel` → `brake`, `gripStrength` → `grip` (in g), `turnSpeedRef` → `turnSpeed`, `coastDeceleration` → `coast`, `hopGravity` → `hop.gravity`, and `chassis` mass, tyre grip and geometry to `weight`, `grip`, `comHeight`, `trackWidth` and `wheelbase`.
- Per-tick modifiers use the dynamics names: `topSpeedScale` → `speedLimitScale`, `accelScale` → `driveScale`, `turnRateScale` → `steerScale`; `gripScale` and `brakeScale` stay. `hop(speed)` is `jump(speed)`.
- `damagedTuning(tuning, effect)` is `damagedSpec(spec, effect)` (`physics/vehicleDamage`); re-derive with `vehicleTuning` and `retune`. `applyVehicleParts` composes onto a `VehicleSpec` and returns `{ spec, feel, parts }`; `GripCurve`, `sampleGripCurve` and `DEFAULT_GRIP_CURVE` live in `physics/gripCurve`.
- `tickDrivableVehicle` takes a `VehicleDynamics`. Its step has no `loadGrip`; read `slip` (`0..1`) for squeal, smoke and drift scoring.

### Added

- `VehicleSpec` feel knobs — `topSpeed`, `accel`, `brake`, `turnRate`, `grip`, `gripCurve`, `drift`, `assist`, `weight`, `power`, `coast`, `bodyRoll`, `suspension`, `hop`, `gearbox`, `downforce` — and `VEHICLE_STYLES.arcade`/`.sim`/`.drift` starting points. Every style launches, grips, slides on the handbrake, catches the slide and never spins on a held keyboard corner (`vehicleHandling.test.ts`).
- Skid marks and tyre smoke for every car: pass `tires: { id, time, marks: ctx.tireMarks, particles: ctx.particles }` to `tickDrivableVehicle`. Sliding, spinning or locked wheels lay fading rubber (`createTireMarks`, `ctx.tireMarks`) that the 3D shell draws on the ground, and hard slides play the new `smoke/tire` effect.
- `createVehicleDynamics` options `obstacles` + `bodyRadius` (the car slides along world solids and its step reports the hardest `impact`), `dragAt` (off-road drag), modifier `speedLimitScale`, a flat `jump` without suspension (`jump.gravity`), and a step `slip`. A gearbox car honours `coast` on top of engine braking.

### Fixed

- A parked car comes to an exact stop instead of creeping on an endless decay, and a wall clamp never hands a car speed it did not have.

### Removed

- `physics/kinematicVehicle`, `physics/vehicleBody`, `damagedTuning`, and Harbor Heat's own tyre-smoke glow (the engine's `tires` option replaces it). The retired `run-loop` and `kinematic-vehicle` capabilities are dropped from game declarations.
