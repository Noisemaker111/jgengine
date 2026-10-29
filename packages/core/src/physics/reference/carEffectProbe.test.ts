import { describe, expect, test } from "bun:test";

import { createVehicleDynamics, withVehicleEffects, type VehicleDynamicsTuning } from "../vehicleDynamics";
import { measureCarEffects } from "./carEffectProbe";
import { measureComparableHandling } from "./compareHandling";
import { MAZDA_MX5_ND } from "./realCars";

const G = 9.81;
const DEG = Math.PI / 180;
const spec = MAZDA_MX5_ND.spec;
const wheelLoad = (spec.massKg * G) / 4;

// The MX-5 in the game model, every effect set from the reference car's own data: the MF6.1 tyre at the static
// wheel load, suspension hardpoints and compliances, driveline inertia and the clutch differential. A fixture that
// keeps the game model honest against the reference, not a preset.
const mx5: VehicleDynamicsTuning = {
  massKg: spec.massKg,
  wheelbase: spec.wheelbase,
  frontWeight: spec.frontWeight,
  comHeight: spec.comHeight,
  trackWidth: 1.5,
  yawInertiaIndex: 0.9,
  front: { peakGrip: 0.952, peakSlipAngle: 0.158, slideGrip: 0.874, longitudinalGrip: 1.11, corneringStiffness: 15.33 },
  driveFront: 0,
  powertrain: {
    kind: "gearbox",
    peakTorque: 201,
    torqueCurve: { points: [[0, 0.68], [0.041, 0.697], [0.207, 0.846], [0.372, 0.92], [0.537, 0.98], [0.636, 1], [0.785, 0.96], [0.868, 0.92], [1, 0.82]] },
    idleRpm: 750,
    redlineRpm: 6800,
    shiftUpRpm: 6650,
    shiftDownRpm: 2720,
    shiftSeconds: 0.25,
    gears: [5.087, 2.991, 2.035, 1.594, 1.286, 1.0],
    reverseGear: 4.0,
    finalDrive: 2.866,
    wheelRadius: 0.308,
    efficiency: 0.92,
    engineBrakeTorque: 25,
    launchRpm: 4000,
  },
  brakeForce: 16234,
  brakeFront: 0.68,
  steering: { maxAngle: 0.545, rate: 0.533 },
  rollStiffness: (spec.massKg * G * spec.comHeight) / (4.12 * DEG),
  pitchStiffness: (spec.massKg * G * spec.comHeight) / (2.88 * DEG),
  effects: {
    combinedSlip: {},
    wheelSlide: {},
    longitudinalLoadTransfer: {},
    lateralLoadTransfer: { frontShare: 0.54 },
    loadSensitivity: { grip: 0.077, stiffness: 0.27, nominalLoad: wheelLoad },
    tireRelaxation: { length: 0.285 },
    camber: { static: -0.022 },
    complianceSteer: { front: 4e-6, rear: -(0.05 * DEG) / 1000 / 2 },
    rollSteer: { front: 0.052, rear: -0.039 },
    aeroDrag: { area: 0.6 },
    rollingResistance: { coefficient: 0.009 },
    rotatingInertia: { engine: 0.13, wheels: 4.6 },
    differential: { kind: "limitedSlip", bias: 1.3 / 0.7 },
    brakeLag: { seconds: 0.03 },
    abs: { strength: 1, holds: 0.97 },
  },
};

// What the reference MX-5 (createReferenceCar) measured on the same probes. A full reference run takes minutes,
// so its numbers are pinned here.
const REFERENCE = {
  brake100To0: 37.06,
  skidpadG: 0.87,
  understeerGradient: 1.53,
  steadyStateMaxG: 0.86,
  rollGradient: 4.12,
  pitchGradient: 2.88,
  zeroTo100: 7.38,
  accel80To120: 4.58,
  powerOnCurvature: 0.86,
  liftOffCurvature: 1.05,
};

describe("measureCarEffects", () => {
  const create = () => createVehicleDynamics(mx5);
  const effects = measureCarEffects(create, { massKg: spec.massKg, frontWeight: spec.frontWeight });
  const handling = measureComparableHandling(create, { wheelbase: spec.wheelbase, skidpadRadius: MAZDA_MX5_ND.tested.skidpadRadius });

  test("the MX-5 composed from its data lands near the reference car", () => {
    const near = (game: number, reference: number, share: number) => expect(Math.abs(game - reference) / reference).toBeLessThan(share);
    near(handling.brake100To0, REFERENCE.brake100To0, 0.05);
    near(handling.skidpadG, REFERENCE.skidpadG, 0.06);
    near(handling.steadyStateMaxG, REFERENCE.steadyStateMaxG, 0.06);
    near(handling.understeerGradient, REFERENCE.understeerGradient, 0.2);
    near(handling.zeroTo100, REFERENCE.zeroTo100, 0.1);
    near(effects.rollGradient, REFERENCE.rollGradient, 0.03);
    near(effects.pitchGradient, REFERENCE.pitchGradient, 0.03);
    near(effects.accel80To120, REFERENCE.accel80To120, 0.05);
    near(effects.powerOnCurvature, REFERENCE.powerOnCurvature, 0.2);
    near(effects.liftOffCurvature, REFERENCE.liftOffCurvature, 0.06);
  }, 30000);

  test("switching drag off leaves only the speed-independent coast-down", () => {
    const noDrag = measureCarEffects(() => createVehicleDynamics(withVehicleEffects(mx5, { aeroDrag: false })), {
      massKg: spec.massKg,
      frontWeight: spec.frontWeight,
    });
    const dragAt100 = (0.5 * 1.225 * 0.6 * (100 / 3.6) ** 2) / spec.massKg;
    expect(effects.coastDecel100 - noDrag.coastDecel100).toBeGreaterThan(dragAt100 * 0.8);
    expect(effects.coastDecel30 - noDrag.coastDecel30).toBeLessThan(dragAt100 * 0.2);
  }, 30000);
});
