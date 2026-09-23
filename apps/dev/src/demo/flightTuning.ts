import type { RigidAircraftTuning } from "@jgengine/core/physics/aircraftDynamics";

// A 950 kg aerobatic monoplane: a short-coupled tail and big ailerons, so it loops in about ten seconds
// and rolls at a few hundred degrees a second. Wing incidence trims it level near 80 m/s at a third throttle.
export const flightDemoPlane: RigidAircraftTuning = {
  massKg: 950,
  inertia: { pitch: 1400, yaw: 2100, roll: 900 },
  surfaces: [
    { at: [2, 0, 0], area: 5.35, liftSlope: 4.8, stallAngle: 0.28, postStallLift: 0.55, incidence: 0.045, control: { roll: 0.4 } },
    { at: [-2, 0, 0], area: 5.35, liftSlope: 4.8, stallAngle: 0.28, postStallLift: 0.55, incidence: 0.045, control: { roll: 0.4 } },
    { at: [0, 0.1, -4.5], area: 2.5, liftSlope: 4.2, control: { pitch: 0.55 } },
    { at: [0, 0.6, -4.6], normal: [1, 0, 0], area: 1.2, liftSlope: 3.5, control: { yaw: 0.6 } },
  ],
  engine: { maxThrust: 9000, spoolRate: 3 },
  controls: { pitch: { maxDeflection: 0.4, rate: 3 }, roll: { maxDeflection: 0.4, rate: 4 }, yaw: { maxDeflection: 0.4, rate: 3 } },
  dragArea: 0.35,
  gear: { height: 1.2 },
};

/** Spawn state: in the air, level, at cruise. */
export const flightDemoSpawn = { position: [0, 250, 0] as const, velocity: [0, 0, 80] as const };

// A light single-rotor helicopter. The main rotor turns counter-clockwise seen from above, so its torque yaws the nose
// left; about a third of right pedal holds heading in a hover. The tail rotor sits at the centre of mass height so
// pedal doesn't also roll the body.
export const flightDemoHelicopter: RigidAircraftTuning = {
  massKg: 1450,
  inertia: { pitch: 4000, yaw: 4500, roll: 1500 },
  surfaces: [
    { at: [0, 0.4, -6.2], area: 0.8, liftSlope: 3 },
    { at: [0, 0.6, -6.6], normal: [1, 0, 0], area: 1, liftSlope: 3 },
  ],
  rotor: { maxThrust: 25000, radius: 5.1, at: [0, 1.5, 0], torque: 10000, damping: 3500, spoolRate: 0.6, tail: { maxThrust: 2500, at: [0, 0, -7.5] } },
  controls: { pitch: { rate: 1.5 }, roll: { rate: 1.5 }, yaw: { rate: 2 } },
  dragArea: 1.5,
  gear: { height: 1 },
};

/** Collective that carries the helicopter's weight out of ground effect, and the pedal that cancels its torque there. */
export const flightDemoHover = { collective: 0.57, pedal: (10000 * 0.57) / (2500 * 7.5) };
