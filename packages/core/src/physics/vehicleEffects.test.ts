import { describe, expect, test } from "bun:test";

import { NEUTRAL_AXIS, type AxisInput } from "../input/axisInput";
import { measureHandling } from "./handlingProbe";
import {
  createVehicleDynamics,
  withVehicleEffects,
  type VehicleDynamics,
  type VehicleDynamicsOptions,
  type VehicleDynamicsStep,
  type VehicleDynamicsTuning,
  type VehicleEffects,
  type VehicleGearboxTuning,
} from "./vehicleDynamics";
import { vehicleTuning } from "./vehicleSpec";

// Each effect against a car that runs none: turning the effect on moves the number it owns, and leaving it out
// removes it. A fixture, not a preset.
const DT = 1 / 60;
const G = 9.81;
const bare: VehicleDynamicsTuning = {
  massKg: 1200,
  wheelbase: 2.5,
  frontWeight: 0.55,
  comHeight: 0.5,
  trackWidth: 1.55,
  front: { peakGrip: 1, peakSlipAngle: 0.12, slideGrip: 0.8 },
  driveFront: 0,
  powertrain: { kind: "direct", maxForce: 7000, maxPower: 120000, coastForce: 0 },
  brakeForce: 14000,
  steering: { maxAngle: 0.6, rate: 20, returnRate: 20 },
};
const gearbox: VehicleGearboxTuning = {
  kind: "gearbox",
  peakTorque: 300,
  torqueCurve: { points: [[0, 0.6], [0.5, 1], [1, 0.8]] },
  idleRpm: 900,
  redlineRpm: 7000,
  shiftUpRpm: 6600,
  shiftDownRpm: 3000,
  shiftSeconds: 0.1,
  gears: [3.4, 2.2, 1.6, 1.2, 1],
  reverseGear: 3.3,
  finalDrive: 3.9,
  wheelRadius: 0.31,
  engineBrakeTorque: 0,
};
const bareGearbox: VehicleDynamicsTuning = { ...bare, powertrain: gearbox };

const axis = (partial: Partial<AxisInput>): AxisInput => ({ ...NEUTRAL_AXIS, ...partial });
const on = (effects: VehicleEffects, base: VehicleDynamicsTuning = bare): VehicleDynamicsTuning => withVehicleEffects(base, effects);

function rolling(tuning: VehicleDynamicsTuning, speed: number, options: VehicleDynamicsOptions = {}): VehicleDynamics {
  const car = createVehicleDynamics(tuning, options);
  const held = car.snapshot();
  car.restore({ ...held, motion: { ...held.motion, vz: speed } });
  return car;
}

function hold(car: VehicleDynamics, input: Partial<AxisInput>, seconds: number): VehicleDynamicsStep {
  let step = car.tick(DT, axis(input));
  for (let i = 1; i < Math.round(seconds / DT); i += 1) step = car.tick(DT, axis(input));
  return step;
}

function coastLoss(tuning: VehicleDynamicsTuning, speed: number): number {
  const car = rolling(tuning, speed);
  hold(car, {}, 0.1);
  const start = hold(car, {}, DT).motion.forwardSpeed;
  return start - hold(car, {}, 1).motion.forwardSpeed;
}

function stoppingDistance(tuning: VehicleDynamicsTuning, speed: number): number {
  const car = rolling(tuning, speed);
  let step = car.tick(DT, axis({ brake: 1 }));
  for (let i = 0; i < 1200 && step.motion.forwardSpeed > 0.3; i += 1) step = car.tick(DT, axis({ brake: 1 }));
  return step.motion.position[2];
}

/** Settles a held steer at a speed held by a throttle loop, then returns the last step. */
function steady(tuning: VehicleDynamicsTuning, speed: number, steer: number, options: VehicleDynamicsOptions = {}): VehicleDynamicsStep {
  const car = rolling(tuning, speed, options);
  let step = car.tick(DT, axis({ steer }));
  for (let i = 0; i < 300; i += 1) {
    const throttle = Math.max(0, Math.min(1, (speed - step.motion.forwardSpeed) * 0.8 + 0.15));
    step = car.tick(DT, axis({ steer, throttle }));
  }
  return step;
}

const totalLoad = (step: VehicleDynamicsStep) => step.loads.wheelLoads.reduce((sum, load) => sum + load, 0);

describe("vehicle effects: each is its own term", () => {
  test("a car with no effects coasts without losing speed", () => {
    expect(coastLoss(bare, 30)).toBeLessThan(1e-6);
  });

  test("aeroDrag slows a coasting car by ½ρCdA·v²/m, and a spec car can switch it off", () => {
    const expected = (0.5 * 1.225 * 0.7 * 30 * 30) / bare.massKg;
    expect(coastLoss(on({ aeroDrag: { area: 0.7 } }), 30)).toBeCloseTo(expected, 1);
    const spec = vehicleTuning({
      engine: { topSpeed: 40, accel: 8 },
      brakes: { brake: 12 },
      steering: { turnRate: 1.6 },
      tires: { grip: 1.1 },
    });
    const withDrag = coastLoss(spec, 30);
    const noDrag = coastLoss(withVehicleEffects(spec, { aeroDrag: false }), 30);
    expect(withDrag - noDrag).toBeGreaterThan(0.2);
    // What is left is the spec's engine braking, which does not grow with speed.
    const engineOnly = withVehicleEffects(spec, { aeroDrag: false, rollingResistance: false });
    expect(coastLoss(engineOnly, 30)).toBeCloseTo(coastLoss(engineOnly, 10), 3);
  });

  test("rollingResistance slows a coasting car by Crr·g at any speed", () => {
    expect(coastLoss(on({ rollingResistance: { coefficient: 0.02 } }), 10)).toBeCloseTo(0.02 * G, 1);
    expect(coastLoss(on({ rollingResistance: { coefficient: 0.02 } }), 30)).toBeCloseTo(0.02 * G, 1);
  });

  test("downforce presses the tyres harder with speed", () => {
    const weight = bare.massKg * G;
    const down = hold(rolling(on({ downforce: { area: 1.5 } }), 40), { throttle: 0.6 }, 0.3);
    expect(totalLoad(down) - weight).toBeCloseTo(0.5 * 1.225 * 1.5 * down.motion.forwardSpeed ** 2, -2);
    expect(totalLoad(hold(rolling(bare, 40), { throttle: 0.6 }, 0.3))).toBeCloseTo(weight, -1);
  });

  test("longitudinalLoadTransfer loads the front under braking", () => {
    const staticFront = bare.massKg * G * bare.frontWeight;
    const braking = (tuning: VehicleDynamicsTuning) => {
      const step = hold(rolling(tuning, 25), { brake: 0.5 }, 0.3);
      return step.loads.wheelLoads[0] + step.loads.wheelLoads[1];
    };
    expect(braking(on({ longitudinalLoadTransfer: {} }))).toBeGreaterThan(staticFront * 1.15);
    expect(braking(bare)).toBeCloseTo(staticFront, -1);
  });

  test("lateralLoadTransfer loads the outside wheels in a corner", () => {
    const split = (tuning: VehicleDynamicsTuning) => {
      const step = steady(tuning, 15, 0.15);
      return Math.abs(step.loads.wheelLoads[0] - step.loads.wheelLoads[1]);
    };
    expect(split(on({ lateralLoadTransfer: {} }))).toBeGreaterThan(1000);
    expect(split(bare)).toBeLessThan(1);
  });

  test("loadSensitivity costs an axle grip as its load shifts outward", () => {
    const transfer = on({ lateralLoadTransfer: {} });
    const plain = measureHandling(() => createVehicleDynamics(transfer)).maxLateralG;
    const sensitive = measureHandling(() => createVehicleDynamics(withVehicleEffects(transfer, { loadSensitivity: { grip: 0.2 } }))).maxLateralG;
    expect(sensitive).toBeLessThan(plain - 0.03);
  });

  test("combinedSlip costs cornering force while braking", () => {
    const lateralWhileBraking = (tuning: VehicleDynamicsTuning) => {
      const car = rolling(tuning, 20);
      hold(car, { steer: 0.25 }, 1.5);
      return Math.abs(hold(car, { steer: 0.25, brake: 0.6 }, 0.25).motion.lateralAccel);
    };
    expect(lateralWhileBraking(on({ combinedSlip: {} }))).toBeLessThan(lateralWhileBraking(bare) * 0.9);
  });

  test("wheelSlide drops a locked wheel to sliding friction, so a locked stop runs longer", () => {
    const slideStop = stoppingDistance(on({ wheelSlide: {} }), 25);
    const peakStop = stoppingDistance(bare, 25);
    expect(slideStop).toBeGreaterThan(peakStop * 1.1);
  });

  test("abs holds the brakes under the grip limit so the wheels never lock", () => {
    const locks = (tuning: VehicleDynamicsTuning) => {
      const car = rolling(tuning, 25);
      let locked = false;
      let active = false;
      for (let i = 0; i < 60; i += 1) {
        const step = car.tick(DT, axis({ brake: 1 }));
        locked ||= step.tires.wheelLock;
        active ||= step.aids.absActive;
      }
      return { locked, active };
    };
    expect(locks(on({ abs: {} }))).toEqual({ locked: false, active: true });
    expect(locks(bare)).toEqual({ locked: true, active: false });
    // `holds` near 1 brakes almost at the limit; the default leaves a margin.
    expect(stoppingDistance(on({ abs: { holds: 0.97 } }), 25)).toBeLessThan(stoppingDistance(on({ abs: {} }), 25) * 0.9);
  });

  test("abs trims engine braking too, so a gearbox car with wheelSlide never locks its driven wheels", () => {
    const engineBraking: VehicleDynamicsTuning = { ...bare, powertrain: { ...gearbox, engineBrakeTorque: 200 } };
    const locked = (tuning: VehicleDynamicsTuning) => {
      const car = createVehicleDynamics(tuning);
      for (let i = 0; i < 1200; i += 1) if (car.tick(DT, axis({ throttle: 1 })).motion.forwardSpeed > 20) break;
      let lock = false;
      for (let i = 0; i < 60; i += 1) lock ||= car.tick(DT, axis({ brake: 1 })).tires.wheelLock;
      return lock;
    };
    expect(locked(on({ wheelSlide: {}, abs: { holds: 0.97 } }, engineBraking))).toBe(false);
    expect(locked(on({ wheelSlide: {} }, engineBraking))).toBe(true);
  });

  test("brakeLag lets the pressure build over its time constant", () => {
    const firstDecel = (tuning: VehicleDynamicsTuning) => -hold(rolling(tuning, 20), { brake: 0.4 }, 2 * DT).motion.longitudinalAccel;
    expect(firstDecel(on({ brakeLag: { seconds: 0.1 } }))).toBeLessThan(firstDecel(bare) * 0.5);
  });

  test("tractionControl stops wheelspin on a slippery launch", () => {
    const spins = (tuning: VehicleDynamicsTuning) => {
      const car = createVehicleDynamics(tuning, { surfaceFriction: () => 0.3 });
      let spin = false;
      for (let i = 0; i < 60; i += 1) spin ||= car.tick(DT, axis({ throttle: 1 })).tires.wheelspin;
      return spin;
    };
    expect(spins(bare)).toBe(true);
    expect(spins(on({ tractionControl: {} }))).toBe(false);
  });

  test("rotatingInertia makes a car launch slower, most in low gears", () => {
    const toSpeed = (tuning: VehicleDynamicsTuning) => {
      const car = createVehicleDynamics(tuning);
      for (let i = 1; i < 1200; i += 1) if (car.tick(DT, axis({ throttle: 1 })).motion.forwardSpeed > 14) return i * DT;
      return Number.POSITIVE_INFINITY;
    };
    const plain = toSpeed(bareGearbox);
    expect(toSpeed(on({ rotatingInertia: { engine: 0.15, wheels: 4 } }, bareGearbox))).toBeGreaterThan(plain * 1.1);
    expect(toSpeed(on({ rotatingInertia: { wheels: 4 } }, bareGearbox))).toBeGreaterThan(plain);
  });

  test("rotatingInertia: a hard stop declutches the engine, but the wheels still have to be slowed", () => {
    const stop = (tuning: VehicleDynamicsTuning) => {
      const car = createVehicleDynamics(tuning);
      for (let i = 0; i < 1200; i += 1) if (car.tick(DT, axis({ throttle: 1 })).motion.forwardSpeed > 20) break;
      const start = car.pose().position[2];
      let step = car.tick(DT, axis({ brake: 1 }));
      for (let i = 0; i < 600 && step.motion.forwardSpeed > 0.3; i += 1) step = car.tick(DT, axis({ brake: 1 }));
      return step.motion.position[2] - start;
    };
    const plain = stop(bareGearbox);
    expect(stop(on({ rotatingInertia: { engine: 0.5 } }, bareGearbox))).toBeCloseTo(plain, 0);
    expect(stop(on({ rotatingInertia: { wheels: 8 } }, bareGearbox))).toBeGreaterThan(plain * 1.03);
  });

  test("corneringStiffness sets the small-slip slope and keeps the peak at peakSlipAngle", () => {
    const tyre = (corneringStiffness?: number): VehicleDynamicsTuning => ({
      ...bare,
      front: corneringStiffness === undefined ? bare.front : { ...bare.front, corneringStiffness },
    });
    const slip = (tuning: VehicleDynamicsTuning) => Math.abs(steady(tuning, 15, 0.06).tires.slipAngleRear);
    // The shape alone gives about 20 per rad here; 10 needs about twice the slip for the same light corner.
    expect(slip(tyre(10))).toBeGreaterThan(slip(tyre()) * 1.6);
    expect(slip(tyre(20))).toBeCloseTo(slip(tyre()), 2);
    const soft = measureHandling(() => createVehicleDynamics(tyre(10))).maxLateralG;
    expect(soft).toBeCloseTo(measureHandling(() => createVehicleDynamics(tyre())).maxLateralG, 1);
  });

  test("tireRelaxation delays the lateral force after a steer step", () => {
    // Lag time is length / speed: 2 m at 20 m/s is 0.1 s.
    const early = (tuning: VehicleDynamicsTuning) => Math.abs(hold(rolling(tuning, 20), { steer: 0.2 }, 0.05).motion.lateralAccel);
    expect(early(on({ tireRelaxation: { length: 2 } }))).toBeLessThan(early(bare) * 0.7);
  });

  test("complianceSteer front gives way under cornering force: more understeer at the same steer", () => {
    const yaw = (tuning: VehicleDynamicsTuning) => Math.abs(steady(tuning, 20, 0.08).motion.yawRate);
    expect(yaw(on({ complianceSteer: { front: 1e-5 } }))).toBeLessThan(yaw(bare) * 0.9);
    expect(yaw(on({ complianceSteer: { rear: 1e-5 } }))).toBeGreaterThan(yaw(bare) * 1.05);
  });

  test("rollSteer steers with body roll", () => {
    const rolls = on({ lateralLoadTransfer: {} });
    const yaw = (tuning: VehicleDynamicsTuning) => Math.abs(steady(tuning, 20, 0.08).motion.yawRate);
    expect(yaw(withVehicleEffects(rolls, { rollSteer: { front: 0.5 } }))).toBeLessThan(yaw(rolls) * 0.95);
  });

  test("camber: static negative camber helps the loaded outside wheel hold more", () => {
    const transfer = on({ lateralLoadTransfer: {} });
    const plain = measureHandling(() => createVehicleDynamics(transfer)).maxLateralG;
    const cambered = measureHandling(() =>
      createVehicleDynamics(withVehicleEffects(transfer, { camber: { static: -0.05, rollFollow: 0 } })),
    ).maxLateralG;
    expect(cambered).toBeGreaterThan(plain + 0.01);
  });

  test("differential: an open diff spins the light inside wheel, a locked one fights the turn", () => {
    const transfer = on({ lateralLoadTransfer: {} });
    const exitAccel = (tuning: VehicleDynamicsTuning) => {
      const car = rolling(tuning, 10);
      hold(car, { steer: 0.5 }, 1.5);
      return hold(car, { steer: 0.5, throttle: 1 }, 0.3).motion.longitudinalAccel;
    };
    const open = exitAccel(withVehicleEffects(transfer, { differential: { kind: "open" } }));
    const lsd = exitAccel(withVehicleEffects(transfer, { differential: { kind: "limitedSlip", bias: 3 } }));
    expect(lsd).toBeGreaterThan(open + 0.2);
    const yaw = (tuning: VehicleDynamicsTuning) => Math.abs(steady(tuning, 8, 0.3).motion.yawRate);
    expect(yaw(on({ differential: { kind: "locked" } }))).toBeLessThan(yaw(bare) * 0.95);
  });

  test("speedSensitiveSteering cuts full lock at speed", () => {
    const lock = (tuning: VehicleDynamicsTuning) => Math.abs(hold(rolling(tuning, 30), { steer: 1 }, 0.1).steering.roadWheelAngle);
    expect(lock(on({ speedSensitiveSteering: { angle: 0.1, at: 25 } }))).toBeCloseTo(0.1, 2);
    expect(lock(bare)).toBeGreaterThan(0.5);
  });

  test("selfAlign steers the front wheels into a slide with the wheel let go", () => {
    const intoSlide = (tuning: VehicleDynamicsTuning) => {
      const car = rolling(tuning, 18);
      hold(car, { steer: 1, handbrake: 1 }, 0.5);
      return Math.abs(hold(car, {}, 0.1).steering.roadWheelAngle);
    };
    expect(intoSlide(on({ selfAlign: { strength: 0.8 } }))).toBeGreaterThan(0.05);
    expect(intoSlide(bare)).toBeLessThan(0.01);
  });

  test("stability control holds sideslip near its limit in a handbrake slide", () => {
    const peak = (tuning: VehicleDynamicsTuning) => measureHandling(() => createVehicleDynamics(tuning)).handbrakePeakSideslipDeg;
    expect(peak(on({ stability: { maxSideslip: 0.2 } }))).toBeLessThan(peak(bare) * 0.7);
  });
});
