import { describe, expect, test } from "bun:test";

import type { AxisInput } from "../input/axisInput";
import { carFromReference, type CarOverrides } from "./carReferences";
import { measureHandling } from "./handlingProbe";
import { createVehicleDynamics, withVehicleEffects, type VehicleDynamics, type VehicleDynamicsStep, type VehicleDynamicsTuning, type VehicleEffectName } from "./vehicleDynamics";
import { vehicleTuning } from "./vehicleSpec";

const DT = 1 / 60;
const DEG = Math.PI / 180;
/** The dial values every effect is checked at: off, a little, as measured, double, and the top of the sane range. */
const DIAL = [0, 0.2, 1, 2, 4] as const;
const input = (throttle: number, brake: number, steer: number): AxisInput => ({ throttle, brake, steer, handbrake: 0 });

function rolling(tuning: VehicleDynamicsTuning, speed: number): VehicleDynamics {
  const car = createVehicleDynamics(tuning);
  const at = car.snapshot();
  car.restore({ ...at, motion: { ...at.motion, vz: speed } });
  return car;
}

function drive(car: VehicleDynamics, axis: AxisInput, seconds: number, each?: (step: VehicleDynamicsStep) => void): VehicleDynamicsStep {
  let step = car.tick(DT, axis);
  each?.(step);
  for (let i = 1; i < Math.round(seconds / DT); i += 1) {
    step = car.tick(DT, axis);
    each?.(step);
  }
  return step;
}

/** A steady turn at `speed` with a speed-holding throttle; the last step. */
function steadyTurn(tuning: VehicleDynamicsTuning, speed: number, steer: number): VehicleDynamicsStep {
  const car = rolling(tuning, speed);
  let step = car.tick(DT, input(0, 0, steer));
  for (let i = 0; i < 360; i += 1) step = car.tick(DT, input(Math.max(0, Math.min(1, (speed - step.motion.forwardSpeed) * 0.8 + 0.2)), 0, steer));
  return step;
}

function stopDistance(car: VehicleDynamics): number {
  const start = car.pose().position[2];
  let step = car.tick(DT, input(0, 1, 0));
  for (let i = 0; i < 1200 && step.motion.forwardSpeed > 0.3; i += 1) step = car.tick(DT, input(0, 1, 0));
  return step.motion.position[2] - start;
}

function zeroTo100(tuning: VehicleDynamicsTuning): number {
  const car = createVehicleDynamics(tuning);
  for (let i = 1; i < 60 * 30; i += 1) if (car.tick(DT, input(1, 0, 0)).motion.forwardSpeed >= 100 / 3.6) return i * DT;
  return Number.POSITIVE_INFINITY;
}

const sportsCar = carFromReference("sports-car");
const at = (name: VehicleEffectName, strength: number, base: VehicleDynamicsTuning = sportsCar, overrides: CarOverrides = {}): VehicleDynamicsTuning => {
  const effect = base.effects?.[name];
  if (effect === undefined) throw new Error(`no ${name} on the base car`);
  return withVehicleEffects({ ...base, ...overrides }, { [name]: { ...effect, strength } });
};

/** Each effect, the number it governs, and which way that number moves as the dial rises. */
const GOVERNED: { name: VehicleEffectName; metric: string; rises: boolean; base?: VehicleDynamicsTuning; measure: (tuning: VehicleDynamicsTuning) => number }[] = [
  { name: "magicFormula", metric: "lateral g on a 0.6-steer turn at 15 m/s", rises: false, measure: (t) => Math.abs(steadyTurn(t, 15, 0.6).motion.lateralAccel) },
  { name: "longitudinalLoadTransfer", metric: "front axle's share of load under full brake", rises: true, measure: (t) => { const s = drive(rolling(t, 25), input(0, 1, 0), 0.5); return s.loads.frontLoad / (s.loads.frontLoad + s.loads.rearLoad); } },
  { name: "lateralLoadTransfer", metric: "outside front wheel's share of front load in a turn", rises: true, measure: (t) => { const s = steadyTurn(t, 15, 0.4); const [l, r] = s.loads.wheelLoads; return Math.max(l, r) / (l + r); } },
  { name: "suspensionKinematics", metric: "body roll in a turn", rises: false, measure: (t) => Math.abs(steadyTurn(t, 15, 0.4).body.bodyRoll) },
  { name: "tireRelaxation", metric: "yaw rate 0.1 s after a steer step", rises: false, measure: (t) => { const car = rolling(t, 20); drive(car, input(0.2, 0, 0), 0.2); return Math.abs(drive(car, input(0.2, 0, 0.4), 0.1).motion.yawRate); } },
  { name: "complianceSteer", metric: "road wheel given up to cornering force", rises: true, measure: (t) => { const s = steadyTurn(t, 15, 0.4); return Math.abs(s.steering.steerAngle - s.steering.roadWheelAngle); } },
  { name: "rollSteer", metric: "road wheel steered by body roll", rises: true, measure: (t) => { const s = steadyTurn(t, 15, 0.4); return Math.abs(s.steering.steerAngle - s.steering.roadWheelAngle); } },
  { name: "aligningTorque", metric: "road wheel given to the aligning torque", rises: true, measure: (t) => { const s = steadyTurn(t, 15, 0.4); return Math.abs(s.steering.steerAngle - s.steering.roadWheelAngle); } },
  { name: "aeroDrag", metric: "speed after 30 s at full throttle", rises: false, measure: (t) => drive(createVehicleDynamics(t), input(1, 0, 0), 30).motion.forwardSpeed },
  { name: "rollingResistance", metric: "speed lost coasting 3 s from 30 m/s", rises: true, measure: (t) => 30 - drive(rolling(t, 30), input(0, 0, 0), 3).motion.forwardSpeed },
  { name: "rotatingInertia", metric: "0-100 km/h", rises: true, measure: zeroTo100 },
  { name: "torqueCurve", metric: "0-100 km/h", rises: true, measure: zeroTo100 },
  { name: "brakeLag", metric: "stopping distance from 25 m/s", rises: true, measure: (t) => stopDistance(rolling(t, 25)) },
  { name: "brakeFade", metric: "stopping distance from 25 m/s on 550 °C discs", rises: true, measure: (t) => { const car = rolling(t, 25); const s = car.snapshot(); car.restore({ ...s, drivetrain: { ...s.drivetrain, brakeTemperature: 550 } }); return stopDistance(car); } },
  { name: "roadFriction", metric: "lateral g on a wet (0.6) road", rises: false, base: carFromReference("sports-car", { effects: { roadFriction: { friction: 0.6 } } }), measure: (t) => Math.abs(steadyTurn(t, 15, 0.6).motion.lateralAccel) },
  { name: "combinedSlip", metric: "lateral g under light braking in a turn", rises: false, base: withVehicleEffects(sportsCar, { abs: false }), measure: (t) => { const car = rolling(t, 20); drive(car, input(0.2, 0, 0.5), 1.5); return Math.abs(drive(car, input(0, 0.3, 0.5), 0.3).motion.lateralAccel); } },
  { name: "downforce", metric: "tyre load at 50 m/s", rises: true, base: withVehicleEffects(sportsCar, { downforce: { area: 0.8 } }), measure: (t) => { const s = drive(rolling(t, 50), input(1, 0, 0), 0.2); return s.loads.frontLoad + s.loads.rearLoad; } },
  { name: "tireCrown", metric: "lateral g at full lean", rises: false, base: carFromReference("motorcycle"), measure: (t) => Math.abs(steadyTurn(t, 20, 1).motion.lateralAccel) },
];

function bounded(step: VehicleDynamicsStep): void {
  for (const value of [...step.motion.position, step.motion.forwardSpeed, step.motion.lateralSpeed, step.motion.yawRate, step.body.bodyRoll, step.body.bodyPitch, step.brakes.temperature]) expect(Number.isFinite(value)).toBe(true);
  expect(Math.abs(step.motion.forwardSpeed)).toBeLessThan(120);
  expect(Math.abs(step.motion.yawRate)).toBeLessThan(8);
  expect(Math.abs(step.motion.lateralAccel)).toBeLessThan(40);
  expect(Math.abs(step.body.bodyRoll)).toBeLessThan(0.6);
}

describe("effect strength", () => {
  for (const { name, metric, rises, base, measure } of GOVERNED) {
    test(`${name}: ${metric} moves ${rises ? "up" : "down"} monotonically over the dial 0 … 4 and stays finite`, () => {
      const values = DIAL.map((strength) => measure(at(name, strength, base ?? sportsCar)));
      for (const value of values) expect(Number.isFinite(value)).toBe(true);
      for (let i = 1; i < values.length; i += 1) {
        const step = (values[i] ?? 0) - (values[i - 1] ?? 0);
        expect(rises ? step : -step).toBeGreaterThanOrEqual(-1e-9);
      }
      expect(values[4]).not.toBe(values[0]);
    }, 30000);
  }

  for (const strength of [0.2, 4]) {
    test(`every effect of the sports car at ${strength} drives a hard lap that stays finite and bounded`, () => {
      const changes = Object.fromEntries(Object.entries(sportsCar.effects ?? {}).map(([name, effect]) => [name, { ...effect, strength }]));
      const car = createVehicleDynamics(withVehicleEffects(sportsCar, changes));
      for (let i = 0; i < 60 * 40; i += 1) {
        const phase = Math.floor(i / 240) % 4;
        bounded(car.tick(DT, input(phase === 2 ? 0 : 1, phase === 2 ? 1 : 0, Math.sin(i / 50))));
      }
    }, 30000);
  }
});

describe("fixtures a game builds from the same terms", () => {
  test("drift: tyre grip 0.4, road 0.6, weight transfer 1.5 throws the rear out under a step steer, slides, and recovers with counter-steer and throttle", () => {
    const drift = carFromReference("sports-car", {
      steering: { maxAngle: 0.6, rate: 3 },
      effects: {
        magicFormula: { grip: 0.4 },
        roadFriction: { friction: 0.6 },
        longitudinalLoadTransfer: { strength: 1.5 },
        lateralLoadTransfer: { strength: 1.5 },
        tractionControl: false,
      },
    });
    const run = (tuning: VehicleDynamicsTuning) => {
      const car = rolling(tuning, 20);
      let caught = -1;
      let slide = 0;
      let peak = 0;
      let recovered = -1;
      let last = car.tick(DT, input(1, 0, 0.5));
      for (let i = 1; i < 60 * 10; i += 1) {
        const t = i * DT;
        const sideslip = last.tires.sideslip;
        if (caught < 0 && (Math.abs(sideslip) > 10 * DEG || t > 3)) caught = t;
        // Counter-steer: point the front wheels where the front axle is travelling, with a little throttle.
        const along = Math.atan2(last.motion.lateralSpeed - 1.155 * last.motion.yawRate, Math.max(1, last.motion.forwardSpeed)) / 0.6;
        last = car.tick(DT, caught < 0 ? input(1, 0, 0.5) : input(0.3, 0, Math.max(-1, Math.min(1, along))));
        bounded(last);
        const beta = Math.abs(last.tires.sideslip);
        peak = Math.max(peak, beta);
        if (beta > 10 * DEG) slide += DT;
        if (caught >= 0 && recovered < 0 && beta < 2 * DEG && Math.abs(last.motion.yawRate) < 0.05) recovered = t;
      }
      return { caught, slide, peak, recovered, speed: last.motion.forwardSpeed };
    };
    const slid = run(drift);
    expect(slid.caught).toBeLessThan(2);
    expect(slid.peak).toBeGreaterThan(15 * DEG);
    expect(slid.slide).toBeGreaterThan(1);
    expect(slid.recovered).toBeGreaterThan(slid.caught + slid.slide);
    expect(slid.recovered).toBeLessThan(9);
    expect(slid.speed).toBeGreaterThan(10);
    // The same step on the real car's grip lets the rear go less far and for less long.
    const real = run(carFromReference("sports-car", { steering: { maxAngle: 0.6, rate: 3 } }));
    expect(real.peak).toBeLessThan(slid.peak);
    expect(real.slide).toBeLessThan(slid.slide);
  }, 30000);

  test("kart: a tenth of the weight transfer, low mass and no suspension stays planted and turns sharply", () => {
    const kart = carFromReference("kart", { effects: { longitudinalLoadTransfer: { strength: 0.1 }, lateralLoadTransfer: { strength: 0.1 } } });
    const turn = steadyTurn(kart, 12, 1);
    expect(Math.abs(turn.tires.sideslip)).toBeLessThan(6 * DEG);
    for (const load of turn.loads.wheelLoads) expect(load).toBeGreaterThan(0.15 * 160 * 9.81);
    const radius = Math.abs(turn.motion.forwardSpeed / turn.motion.yawRate);
    expect(radius).toBeLessThan(18);
    expect(Math.abs(turn.motion.lateralAccel) / 9.81).toBeGreaterThan(0.85);
    // Full weight transfer on the same kart lifts its inside wheels further.
    const full = steadyTurn(carFromReference("kart"), 12, 1);
    expect(Math.min(...full.loads.wheelLoads)).toBeLessThan(Math.min(...turn.loads.wheelLoads));
  }, 30000);

  test("an arcade car with every effect at 0 drives exactly like the same car with none", () => {
    const arcade = vehicleTuning({ engine: { topSpeed: 40, accel: 9 }, brakes: { brake: 14, abs: 1 }, steering: { turnRate: 1.4 }, tires: { grip: 1.6, drift: 0.15 }, aids: { stability: 1 }, chassis: { weight: 1150 } });
    const all = { ...arcade.effects, ...sportsCar.effects };
    const zeroed = withVehicleEffects(arcade, Object.fromEntries(Object.entries(all).map(([name, effect]) => [name, { ...effect, strength: 0 }])));
    const bare: VehicleDynamicsTuning = { ...arcade, effects: {} };
    const a = createVehicleDynamics(zeroed);
    const b = createVehicleDynamics(bare);
    for (let i = 0; i < 60 * 20; i += 1) {
      const axis = input(i % 300 < 200 ? 1 : 0, i % 300 >= 250 ? 1 : 0, Math.sin(i / 40));
      const sa = a.tick(DT, axis);
      const sb = b.tick(DT, axis);
      expect(sa.motion).toEqual(sb.motion);
      expect(sa.tires.sideslip).toBe(sb.tires.sideslip);
    }
  });

  test("every term keeps its state in the groups: a snapshot mid-drive restores bit-for-bit, and retune keeps momentum", () => {
    const tuning = carFromReference("sports-car", { effects: { brakeFade: { heatCapacity: 2000 } } });
    const car = createVehicleDynamics(tuning);
    const axis = (i: number) => input(i % 240 < 180 ? 1 : 0, i % 240 >= 180 ? 1 : 0, Math.sin(i / 30) * 0.6);
    for (let i = 0; i < 600; i += 1) car.tick(DT, axis(i));
    const saved = car.snapshot();
    expect(saved.drivetrain.brakeTemperature).toBeGreaterThan(30);
    expect(saved.motion.time).toBeCloseTo(10, 6);
    const ahead = Array.from({ length: 120 }, (_, i) => car.tick(DT, axis(600 + i)).motion);
    const twin = createVehicleDynamics(tuning);
    twin.restore(saved);
    const replay = Array.from({ length: 120 }, (_, i) => twin.tick(DT, axis(600 + i)).motion);
    expect(replay).toEqual(ahead);
    const speed = car.tick(DT, axis(0)).motion.forwardSpeed;
    car.retune(withVehicleEffects(tuning, { roadFriction: { friction: 0.5 }, aligningTorque: { strength: 3 } }));
    expect(car.tick(DT, input(0, 0, 0)).motion.forwardSpeed).toBeCloseTo(speed, 0);
  });

  test("a class car is one line and handles like its class", () => {
    const truck = measureHandling(() => createVehicleDynamics(carFromReference("truck")));
    const sports = measureHandling(() => createVehicleDynamics(sportsCar));
    expect(truck.zeroTo100).toBeGreaterThan(sports.zeroTo100 * 2);
    expect(truck.maxLateralG).toBeLessThan(sports.maxLateralG);
  }, 30000);
});
