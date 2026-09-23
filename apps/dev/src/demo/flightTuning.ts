import type { AircraftAssistTuning, RigidAircraftTuning } from "@jgengine/core/physics/aircraftDynamics";

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

// A two-stage sounding rocket. The booster's dry mass includes the whole upper stage; staging retunes to the upper
// stage with its own motor. Four tail fins keep it pointed into the airflow, and the booster nozzle gimbals.
export const flightDemoUpperStage: RigidAircraftTuning = {
  massKg: 60,
  inertia: { pitch: 90, yaw: 90, roll: 1 },
  surfaces: [
    { at: [0.25, 0, -1.6], area: 0.08, liftSlope: 3 },
    { at: [-0.25, 0, -1.6], area: 0.08, liftSlope: 3 },
    { at: [0, 0.25, -1.6], normal: [1, 0, 0], area: 0.08, liftSlope: 3 },
    { at: [0, -0.25, -1.6], normal: [1, 0, 0], area: 0.08, liftSlope: 3 },
  ],
  motor: { thrustCurve: [[0, 3000], [8, 3000]], propellantKg: 60, massFlow: 7.5, at: [0, 0, -1.8], gimbal: 0.05 },
  controls: { pitch: { rate: 1 }, yaw: { rate: 1 } },
  dragArea: 0.04,
};

export const flightDemoBooster: RigidAircraftTuning = {
  massKg: 270,
  inertia: { pitch: 1800, yaw: 1800, roll: 6 },
  surfaces: [
    { at: [0.45, 0, -3.6], area: 0.5, liftSlope: 3 },
    { at: [-0.45, 0, -3.6], area: 0.5, liftSlope: 3 },
    { at: [0, 0.45, -3.6], normal: [1, 0, 0], area: 0.5, liftSlope: 3 },
    { at: [0, -0.45, -3.6], normal: [1, 0, 0], area: 0.5, liftSlope: 3 },
  ],
  motor: { thrustCurve: [[0, 15000], [5, 15000]], propellantKg: 250, massFlow: 50, at: [0, 0, -4], gimbal: 0.08 },
  controls: { pitch: { rate: 1 }, yaw: { rate: 1 } },
  dragArea: 0.12,
  gear: { height: 4, maxPitch: Math.PI / 2 },
};

/** What T switches on in the demo: light SAS, auto-level and a 6 g limit for the plane. */
export const flightDemoPlaneAssists: AircraftAssistTuning = { sas: { pitch: 0.5, roll: 0.5, yaw: 0.5 }, autoLevel: 0.6, maxG: 6 };

/** Full SAS with heading hold and hover hold for the helicopter. */
export const flightDemoHelicopterAssists: AircraftAssistTuning = { sas: { pitch: 1, roll: 1, yaw: 1 }, hoverHold: 1 };
