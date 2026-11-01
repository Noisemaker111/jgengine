the runtime aircraft reproduces the reference: atmosphere, thrust lapse and spool, polars, damping derivatives, rotor inflow with autorotation and rocket mass flow, each a named effect with a 0-upward dial; aircraftFromReference gives a real aircraft in one line

### Added

- the runtime aircraft reproduces the reference: atmosphere, thrust lapse and spool, polars, damping derivatives, rotor inflow with autorotation and rocket mass flow, each a named effect with a 0-upward dial; aircraftFromReference gives a real aircraft in one line
- `aeroTermValue` (`@jgengine/core/flight/aeroTable`): One term's contribution: its constant or table value times its factor. Also `AeroFactor`, `AeroInput`, `AeroState`, `AeroSurfaceTravel`, `AeroTable`, `AeroTerm`, `sampleAeroTable`, `sumAeroTerms` and 1 more.
- `afterburnerCommand` (`@jgengine/core/flight/afterburner`): Splits a throttle position into dry and afterburner commands, `0..1` each, at a strength: the dry stop moves from full throttle to `dryThrottle` up to strength 1. Also `AircraftAfterburner`, `afterburnerRatio`.
- `effectStrength` (`@jgengine/core/flight/aircraftEffects`): An effect's strength: `0` when absent, else its `strength` (default `1`), never below `0`. Also `AircraftEffects`, `mixEffect`.
- `AIRCRAFT_REFERENCE_IDS` (`@jgengine/core/flight/aircraftReferences`): Every id {@link aircraftFromReference} accepts. Also `AircraftOverrides`, `AircraftReferenceId`, `aircraftFromReference`.
- `SEA_LEVEL_AIR` (`@jgengine/core/flight/atmosphere`): Sea-level standard air, SI units. Also `AirSample`, `AircraftAtmosphere`, `atmosphereAt`, `standardAir`.
- `autorotationRates` (`@jgengine/core/flight/autorotation`): Rotor speed and governor rates for a speed share, governor integral, throttle (engine power share) and aerodynamic rotor torque, N·m, in air of `densityRatio` to sea level. Also `AircraftAutorotation`, `AutorotationRates`, `settledGovernor`.
- `derivativeMoments` (`@jgengine/core/flight/derivatives`): Sums the moment coefficients at an air state, keeping the damping part apart so the strength can scale it alone. Also `AircraftDerivatives`, `DerivativeMoments`.
- `spoolRate` (`@jgengine/core/flight/engineSpool`): The spool's response rate, 1/s, for a step of `step` (share of the dry range) toward its target, at a strength: blends from the simple `spoolRate` up to strength 1, then divides by the strength. Also `AircraftEngineSpool`, `spoolThrust`.
- `machDragArea` (`@jgengine/core/flight/machDrag`): Drag area, m², at a Mach number before the strength: the tabled coefficient times the reference area. Also `AircraftMachDrag`.
- `mainGearMoment` (`@jgengine/core/flight/mainGear`): Nose-down pitching moment, N·m, from a ground reaction `load`, N, at the main wheels. Also `AircraftMainGear`.
- `nozzleThrust` (`@jgengine/core/flight/nozzle`): Delivered thrust, N, for the curve's vacuum thrust, its peak and the ambient pressure, Pa. Also `AircraftNozzle`.
- `polarCoefficients` (`@jgengine/core/flight/polar`): Sums the polar's lift, drag and side-force coefficients at an air state. Also `AircraftAeroGeometry`, `AircraftPolar`, `PolarCoefficients`.
- `C172_PROPELLER_POWER` (`@jgengine/core/flight/propeller`): McCauley 1C160/DTM7553 power coefficients, same grid. Also `AircraftPropeller`, `C172_PROPELLER_THRUST`, `PropellerLoads`, `propellerLoads`, `propellerThrust`, `settledShaftSpeed`.
- `rotatingEarthAcceleration` (`@jgengine/core/flight/rotatingEarth`): Acceleration, m/s² world axes, at a position and Earth-relative velocity: gravity toward the centre blended from the flat field (`simple`) up to strength 1, plus Coriolis and centrifugal terms for the frame's spin. Also `AircraftRotatingEarth`, `RotatingEarthFrame`, `rotatingEarthFrame`.
- `rotorInflowLoads` (`@jgengine/core/flight/rotorInflow`): Rotor thrust and torque at a collective lever `0..1`, rotor speed (share of rated), axial velocity through the disc (m/s, positive climbing), edgewise speed (m/s), air density and hub height above the ground (m). Also `AircraftRotorInflow`, `RotorInflowLoads`.
- `F100_DRY_LAPSE` (`@jgengine/core/flight/thrustLapse`): F100-PW-220 installed thrust lapse from the reference engine cycle (`scripts/reference/flight/gasTurbine.ts`, sized to the published ratings and fitted to NASA TP-1538's F-16 thrust tables): full dry thrust over sea-level static. Also `AircraftThrustLapse`, `F100_WET_LAPSE`, `lapseRatio`, `thrustLapse`.
- `inducedDragFactor` (`@jgengine/core/flight/wingGroundEffect`): Share of free-air induced drag left at a centre-of-gravity height above the ground, `0..1`, at a strength. Also `AircraftWingGroundEffect`.

### Changed

- Part of #2837
