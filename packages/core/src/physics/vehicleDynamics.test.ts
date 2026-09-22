import { describe, expect, test } from "bun:test";

import type { AxisInput } from "../input/axisInput";
import { tickDrivableVehicle } from "./drivableVehicle";
import { measureHandling } from "./handlingProbe";
import { createVehicleDynamics, type VehicleDynamicsTuning, type VehicleGearboxTuning } from "./vehicleDynamics";

const DT = 1 / 60;

const gearbox: VehicleGearboxTuning = {
  kind: "gearbox",
  peakTorque: 420,
  torqueCurve: { points: [[0, 0.55], [0.5, 1], [0.85, 0.92], [1, 0.7]] },
  idleRpm: 900,
  redlineRpm: 7200,
  shiftUpRpm: 6800,
  shiftDownRpm: 3000,
  shiftSeconds: 0.15,
  gears: [3.3, 2.2, 1.6, 1.25, 1.0, 0.82],
  reverseGear: 3.2,
  finalDrive: 3.6,
  wheelRadius: 0.33,
};

// Three deliberately different feels composed from the same fields. These are test fixtures, not presets:
// they prove the seams span the range and pin the metric each knob is meant to move.
const gripRwd: VehicleDynamicsTuning = {
  massKg: 1450,
  wheelbase: 2.6,
  frontWeight: 0.52,
  comHeight: 0.48,
  trackWidth: 1.6,
  rollStiffnessFront: 0.55,
  front: { peakGrip: 1.1, peakSlipAngle: 0.1, slideGrip: 0.75 },
  driveFront: 0,
  powertrain: gearbox,
  brakeForce: 16000,
  steering: { maxAngle: 0.6, highSpeedAngle: 0.12, highSpeedAt: 35, rate: 2.2, returnRate: 3, selfAlign: 0.15 },
  assists: { abs: 1 },
  aero: { dragArea: 0.65, downforceArea: 0.3 },
};

const forgivingStreet: VehicleDynamicsTuning = {
  massKg: 1400,
  wheelbase: 2.6,
  frontWeight: 0.55,
  comHeight: 0.55,
  trackWidth: 1.6,
  yawInertiaIndex: 0.85,
  front: { peakGrip: 1.25, peakSlipAngle: 0.18, slideGrip: 0.9 },
  rear: { peakGrip: 1.2, peakSlipAngle: 0.2, slideGrip: 0.85 },
  driveFront: 0.3,
  powertrain: gearbox,
  brakeForce: 17000,
  handbrakeGrip: 0.25,
  steering: { maxAngle: 0.65, highSpeedAngle: 0.2, highSpeedAt: 30, rate: 4, returnRate: 6, selfAlign: 0.7 },
  assists: { abs: 1, tractionControl: 0.5, stability: 0.9, maxSideslip: 0.35 },
  aero: { dragArea: 0.7 },
  rollStiffness: 14000,
};

const ballCar: VehicleDynamicsTuning = {
  massKg: 180,
  wheelbase: 1.9,
  frontWeight: 0.5,
  comHeight: 0.3,
  trackWidth: 1.4,
  yawInertiaIndex: 0.6,
  front: { peakGrip: 1.7, peakSlipAngle: 0.12, slideGrip: 0.9 },
  driveFront: 0.5,
  powertrain: { kind: "direct", maxForce: 3400, maxPower: 120000, reverseScale: 0.8, coastForce: 150 },
  brakeForce: 6000,
  handbrakeGrip: 0.15,
  steering: { maxAngle: 0.7, highSpeedAngle: 0.45, highSpeedAt: 23, rate: 12, selfAlign: 0.3 },
  speedLimit: 23,
  reverseSpeed: 13,
  assists: { stability: 0.5, maxSideslip: 0.5 },
  rollStiffness: 1e9,
  pitchStiffness: 1e9,
};

function axis(partial: Partial<AxisInput>): AxisInput {
  return { throttle: 0, brake: 0, steer: 0, handbrake: 0, ...partial };
}

function driveScript(tuning: VehicleDynamicsTuning, dt: number, seconds: number) {
  const car = createVehicleDynamics(tuning);
  const ticks = Math.round(seconds / dt);
  let step = car.tick(dt, axis({}));
  for (let i = 0; i < ticks; i += 1) {
    const t = i * dt;
    step = car.tick(dt, axis({ throttle: t < 4 ? 1 : 0.4, steer: t > 4 ? 0.6 : 0 }));
  }
  return { car, step };
}

describe("createVehicleDynamics — integration", () => {
  test("full throttle in a straight line stays straight and gears up", () => {
    const car = createVehicleDynamics(gripRwd);
    let step = car.tick(DT, axis({}));
    for (let i = 0; i < 600; i += 1) step = car.tick(DT, axis({ throttle: 1 }));
    expect(step.heading).toBe(0);
    expect(Math.abs(step.lateralSpeed)).toBeLessThan(1e-9);
    expect(step.forwardSpeed).toBeGreaterThan(40);
    expect(step.gear).toBeGreaterThan(3);
    expect(step.rpm).toBeLessThanOrEqual(gearbox.redlineRpm);
  });

  test("the same inputs produce the same state", () => {
    const a = driveScript(gripRwd, DT, 8);
    const b = driveScript(gripRwd, DT, 8);
    expect(a.car.snapshot()).toEqual(b.car.snapshot());
  });

  test("snapshot/restore resumes bit-for-bit (prediction rollback)", () => {
    const reference = createVehicleDynamics(forgivingStreet);
    const replica = createVehicleDynamics(forgivingStreet);
    const inputs = Array.from({ length: 480 }, (_, i) =>
      axis({ throttle: i < 200 ? 1 : 0.3, steer: i > 200 ? Math.sin(i / 30) : 0, handbrake: i > 300 && i < 330 ? 1 : 0 }),
    );
    let saved = reference.snapshot();
    for (let i = 0; i < inputs.length; i += 1) {
      if (i === 250) saved = reference.snapshot();
      reference.tick(DT, inputs[i]!);
    }
    replica.restore(saved);
    for (let i = 250; i < inputs.length; i += 1) replica.tick(DT, inputs[i]!);
    expect(replica.snapshot()).toEqual(reference.snapshot());
  });

  test("frame rate does not change where the car ends up", () => {
    const slow = driveScript(gripRwd, 1 / 30, 7).step;
    const fast = driveScript(gripRwd, 1 / 144, 7).step;
    expect(Math.abs(slow.heading - fast.heading)).toBeLessThan(0.03);
    expect(Math.hypot(slow.position[0] - fast.position[0], slow.position[2] - fast.position[2])).toBeLessThan(1);
  });

  test("brakes stop the car without reversing, then a held brake reverses it", () => {
    const car = createVehicleDynamics(gripRwd);
    for (let i = 0; i < 240; i += 1) car.tick(DT, axis({ throttle: 1 }));
    let step = car.tick(DT, axis({ brake: 1 }));
    let lowest = step.forwardSpeed;
    for (let i = 0; i < 300 && step.forwardSpeed > 0.2; i += 1) {
      step = car.tick(DT, axis({ brake: 1 }));
      lowest = Math.min(lowest, step.forwardSpeed);
    }
    expect(lowest).toBeGreaterThanOrEqual(-0.01);
    for (let i = 0; i < 240; i += 1) step = car.tick(DT, axis({ brake: 1 }));
    expect(step.gear).toBe(-1);
    expect(step.forwardSpeed).toBeLessThan(-2);
    expect(step.forwardSpeed).toBeGreaterThanOrEqual(-(gripRwd.reverseSpeed ?? 8) - 0.01);
  });

  test("retune swaps tuning without costing momentum", () => {
    const car = createVehicleDynamics(gripRwd);
    for (let i = 0; i < 180; i += 1) car.tick(DT, axis({ throttle: 1 }));
    const before = car.velocity();
    car.retune({ ...gripRwd, front: { ...gripRwd.front, peakGrip: 0.4 } });
    expect(car.velocity()).toEqual(before);
    expect(car.tuning().front.peakGrip).toBe(0.4);
  });

  test("the speed governor caps drive but still lets the car turn and be boosted past it", () => {
    const car = createVehicleDynamics(ballCar);
    let step = car.tick(DT, axis({}));
    for (let i = 0; i < 300; i += 1) step = car.tick(DT, axis({ throttle: 1 }));
    expect(step.forwardSpeed).toBeCloseTo(23, 0);
    for (let i = 0; i < 60; i += 1) step = car.tick(DT, axis({ throttle: 1, steer: 0.5 }));
    expect(Math.abs(step.yawRate)).toBeGreaterThan(0.5);
    const boosted = createVehicleDynamics(ballCar);
    for (let i = 0; i < 400; i += 1) step = boosted.tick(DT, axis({ throttle: 1 }), { thrust: 1800 });
    expect(step.forwardSpeed).toBeGreaterThan(30);
  });

  test("tickDrivableVehicle drives it into a setPose patch", () => {
    const car = createVehicleDynamics(gripRwd, { position: [2, 0, 3] });
    const drive = tickDrivableVehicle(car, DT, axis({ throttle: 1 }), { groundHeight: () => 1.5 });
    expect(drive.pose.position[1]).toBe(1.5);
    expect(drive.step.gear).toBe(1);
  });
});

describe("createVehicleDynamics — handling emerges from physical knobs", () => {
  test("a grip car pulls about its tire μ in lateral g and survives a held keyboard steer at speed", () => {
    const report = measureHandling(() => createVehicleDynamics(gripRwd));
    expect(report.maxLateralG).toBeGreaterThan(0.95);
    expect(report.maxLateralG).toBeLessThan(1.2);
    expect(report.zeroTo100).toBeGreaterThan(3.5);
    expect(report.zeroTo100).toBeLessThan(6.5);
    expect(report.brake100To0).toBeLessThan(45);
    expect(report.turnIn).toBeLessThan(0.35);
    expect(report.spun).toBe(false);
    expect(report.stepPeakSideslipDeg).toBeLessThan(8);
    const faster = measureHandling(() => createVehicleDynamics(gripRwd), { cornerSpeed: 38 });
    expect(faster.spun).toBe(false);
  });

  test("lower grip surfaces scale lateral g down", () => {
    const ice = measureHandling(() => createVehicleDynamics(gripRwd, { surfaceFriction: () => 0.3 }));
    const dry = measureHandling(() => createVehicleDynamics(gripRwd));
    expect(ice.maxLateralG).toBeLessThan(dry.maxLateralG * 0.45);
  });

  test("roll-stiffness distribution moves the balance between understeer and oversteer", () => {
    const pushy = measureHandling(() => createVehicleDynamics({ ...gripRwd, rollStiffnessFront: 0.8, loadSensitivity: 0.4 }));
    const loose = measureHandling(() => createVehicleDynamics({ ...gripRwd, rollStiffnessFront: 0.4, loadSensitivity: 0.4 }));
    expect(loose.stepPeakSideslipDeg).toBeGreaterThan(pushy.stepPeakSideslipDeg * 1.5);
    expect(loose.stepSteadyYawRate).toBeGreaterThan(pushy.stepSteadyYawRate);
    // A front-limited car tucks in when lifting, because the load shift hands grip back to the front axle.
    expect(pushy.liftOffYawGain).toBeGreaterThan(1.1);
  });

  test("rear drive turns throttle into oversteer, front drive into understeer", () => {
    const powerOn = (driveFront: number) => {
      const car = createVehicleDynamics({ ...gripRwd, driveFront, powertrain: { ...gearbox, peakTorque: 700 } });
      for (let i = 0; i < 600; i += 1) if (car.tick(DT, axis({ throttle: 1 })).forwardSpeed > 12) break;
      for (let i = 0; i < 60; i += 1) car.tick(DT, axis({ throttle: 0.3, steer: 0.5 }));
      let peak = 0;
      for (let i = 0; i < 90; i += 1) peak = Math.max(peak, Math.abs(car.tick(DT, axis({ throttle: 1, steer: 0.5 })).sideslip));
      return peak;
    };
    expect(powerOn(0)).toBeGreaterThan(powerOn(1) * 2);
  });

  test("the forgiving street feel drifts further on the handbrake yet never spins on a held key", () => {
    const street = measureHandling(() => createVehicleDynamics(forgivingStreet));
    const grip = measureHandling(() => createVehicleDynamics(gripRwd));
    expect(street.spun).toBe(false);
    expect(street.stepPeakSideslipDeg).toBeGreaterThan(grip.stepPeakSideslipDeg);
    expect(street.handbrakePeakSideslipDeg).toBeGreaterThan(30);
    expect(measureHandling(() => createVehicleDynamics(forgivingStreet), { cornerSpeed: 40 }).spun).toBe(false);
  });

  test("the ball car turns in fastest and holds the most lateral g at its capped speed", () => {
    const ball = measureHandling(() => createVehicleDynamics(ballCar), { cornerSpeed: 20 });
    const grip = measureHandling(() => createVehicleDynamics(gripRwd), { cornerSpeed: 20 });
    expect(ball.topSpeed).toBeCloseTo(23, 0);
    expect(ball.zeroTo100).toBe(Number.POSITIVE_INFINITY);
    expect(ball.turnIn).toBeLessThan(grip.turnIn);
    expect(ball.maxLateralG).toBeGreaterThan(grip.maxLateralG + 0.4);
    expect(ball.spun).toBe(false);
  });

  test("traction control budgets for cornering grip, so full throttle with full steer no longer spins a RWD car", () => {
    const bare = measureHandling(() => createVehicleDynamics(gripRwd));
    const assisted = measureHandling(() => createVehicleDynamics({ ...gripRwd, assists: { abs: 1, tractionControl: 0.6 } }));
    expect(bare.powerSteerSpun).toBe(true);
    expect(assisted.powerSteerSpun).toBe(false);
    expect(assisted.powerSteerPeakSideslipDeg).toBeLessThan(15);
  });

  test("ABS keeps the front steering under full brake", () => {
    const headingChange = (abs: number) => {
      const car = createVehicleDynamics({ ...gripRwd, assists: { abs } });
      for (let i = 0; i < 600; i += 1) if (car.tick(DT, axis({ throttle: 1 })).forwardSpeed > 25) break;
      const start = car.pose().heading;
      for (let i = 0; i < 60; i += 1) car.tick(DT, axis({ brake: 1, steer: 1 }));
      return Math.abs(car.pose().heading - start);
    };
    expect(headingChange(1)).toBeGreaterThan(headingChange(0) * 1.5);
  });
});
