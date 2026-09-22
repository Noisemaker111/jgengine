import type { VehicleDynamicsTuning } from "@jgengine/core/physics/vehicleDynamics";

// A rear-driven street car tuned for keyboard play: honest grip and weight transfer, with caster
// self-alignment and light stability control so a held key at speed slides and recovers instead of spinning.
export const handlingDemoTuning: VehicleDynamicsTuning = {
  massKg: 1380,
  wheelbase: 2.55,
  frontWeight: 0.53,
  comHeight: 0.5,
  trackWidth: 1.58,
  yawInertiaIndex: 0.92,
  rollStiffnessFront: 0.6,
  front: { peakGrip: 1.15, peakSlipAngle: 0.13, slideGrip: 0.82 },
  rear: { peakGrip: 1.2, peakSlipAngle: 0.14, slideGrip: 0.82 },
  driveFront: 0,
  powertrain: {
    kind: "gearbox",
    peakTorque: 380,
    torqueCurve: { points: [[0, 0.55], [0.45, 1], [0.85, 0.94], [1, 0.72]] },
    idleRpm: 900,
    redlineRpm: 7400,
    shiftUpRpm: 7000,
    shiftDownRpm: 3200,
    shiftSeconds: 0.14,
    gears: [3.4, 2.3, 1.7, 1.3, 1.05, 0.86],
    reverseGear: 3.3,
    finalDrive: 3.7,
    wheelRadius: 0.32,
  },
  brakeForce: 15500,
  handbrakeGrip: 0.3,
  steering: { maxAngle: 0.6, highSpeedAngle: 0.12, highSpeedAt: 32, rate: 2.6, returnRate: 4, selfAlign: 0.55 },
  assists: { abs: 1, tractionControl: 0.55, stability: 0.8, maxSideslip: 0.25 },
  aero: { dragArea: 0.68, downforceArea: 0.25 },
};
