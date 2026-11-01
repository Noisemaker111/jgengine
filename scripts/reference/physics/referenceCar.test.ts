import { describe, expect, test } from "bun:test";

import type { CourseSubject, HandlingSubject, RideSubject } from "@jgengine/core/physics/handlingProbe";
import { magicFormula } from "./magicFormulaTire";
import { MAZDA_MX5_ND } from "./realCars";
import { createReferenceCar, type ReferenceCarSpec } from "./referenceCar";
import type { DoubleWishboneGeometry } from "./suspensionKinematics";

const NEUTRAL = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

describe("createReferenceCar", () => {
  test("fits the probe subjects", () => {
    const car = createReferenceCar(MAZDA_MX5_ND.spec);
    const subjects: [HandlingSubject, CourseSubject, RideSubject] = [car, car, car];
    expect(subjects).toHaveLength(3);
  });

  test("rests on its springs with the published weight split and does not creep", () => {
    const spec = MAZDA_MX5_ND.spec;
    const car = createReferenceCar(spec);
    let step = car.tick(1 / 60, NEUTRAL);
    for (let i = 0; i < 180; i += 1) step = car.tick(1 / 60, NEUTRAL);
    const [fl, fr, rl, rr] = step.loads.wheelLoads;
    const total = fl + fr + rl + rr;
    expect(Math.abs(total - spec.massKg * 9.81) / (spec.massKg * 9.81)).toBeLessThan(0.005);
    expect(Math.abs((fl + fr) / total - spec.frontWeight)).toBeLessThan(0.005);
    expect(Math.hypot(step.motion.position[0], step.motion.position[2])).toBeLessThan(0.002);
    expect(Math.abs(step.body.bodyPitch)).toBeLessThan(0.001);
  });

  test("restore resumes bit for bit", () => {
    const car = createReferenceCar(MAZDA_MX5_ND.spec);
    const drive = { throttle: 0.8, brake: 0, steer: 0.2, handbrake: 0 };
    for (let i = 0; i < 60; i += 1) car.tick(1 / 60, drive);
    const saved = car.snapshot();
    const first = [];
    for (let i = 0; i < 90; i += 1) first.push(car.tick(1 / 60, drive));
    car.restore(saved);
    const second = [];
    for (let i = 0; i < 90; i += 1) second.push(car.tick(1 / 60, drive));
    expect(second).toEqual(first);
    car.reset();
    expect(car.velocity()).toEqual([0, 0]);
  });

  test("a step steer turns the way AxisInput.steer and VehicleDynamics do", () => {
    const car = createReferenceCar(MAZDA_MX5_ND.spec);
    let step = car.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
    while (step.motion.forwardSpeed < 15) step = car.tick(1 / 60, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
    for (let i = 0; i < 60; i += 1) step = car.tick(1 / 60, { throttle: 0.3, brake: 0, steer: 0.1, handbrake: 0 });
    expect(step.motion.yawRate).toBeLessThan(-0.1);
    expect(step.steering.steerAngle).toBeGreaterThan(0);
    expect(step.motion.lateralAccel).toBeGreaterThan(1);
  });
});

// Equal parallel arms and a tie rod parallel to them: no camber or toe change with travel, roll centre at the ground.
function parallelogram(halfTrack: number): DoubleWishboneGeometry {
  const inner = halfTrack - 0.4;
  const outer = halfTrack - 0.05;
  return {
    kind: "doubleWishbone",
    lowerFront: [0.15, inner, 0.15],
    lowerRear: [-0.15, inner, 0.15],
    lowerBallJoint: [0, outer, 0.15],
    upperFront: [0.15, inner, 0.45],
    upperRear: [-0.15, inner, 0.45],
    upperBallJoint: [0, outer, 0.45],
    tieRodInner: [-0.12, inner, 0.15],
    tieRodOuter: [-0.12, outer, 0.15],
    wheelCenter: [0, halfTrack, 0.29],
    camber: 0,
    toe: 0,
    springBody: [0, inner + 0.15, 0.6],
    springArm: [0, inner + 0.2, 0.15],
  };
}

// Steady state at a fixed handwheel angle and constant speed: road-wheel angle minus the Ackermann angle, and lateral g.
function steadyPoint(spec: ReferenceCarSpec, speed: number): { g: number; dynamic: number } {
  const car = createReferenceCar(spec);
  let step = car.tick(1 / 60, NEUTRAL);
  while (step.motion.forwardSpeed < speed) step = car.tick(1 / 60, { ...NEUTRAL, throttle: 0.6 });
  let throttle = 0.2;
  let g = 0;
  let dynamic = 0;
  let count = 0;
  for (let i = 0; i < 480; i += 1) {
    throttle = Math.min(1, Math.max(0, throttle + 0.02 * (speed - step.motion.forwardSpeed)));
    step = car.tick(1 / 60, { ...NEUTRAL, throttle, steer: 0.1 });
    if (i < 360) continue;
    const v = Math.hypot(step.motion.forwardSpeed, step.motion.lateralSpeed);
    g += (v * Math.abs(step.motion.yawRate)) / 9.81;
    dynamic += Math.abs(step.steering.roadWheelAngle) - (spec.wheelbase * Math.abs(step.motion.yawRate)) / v;
    count += 1;
  }
  return { g: g / count, dynamic: ((dynamic / count) * 180) / Math.PI };
}

// The analytic bicycle model at lateral acceleration `g`: axle forces from force and yaw balance with each axle's
// aligning moment, F_f + F_r = m·a_y and F_f·a − F_r·b − M_f − M_r = 0, slip angles from the tyre model at static
// load, and road-wheel angle minus Ackermann δ − L/R = α_f − α_r (degrees).
function bicycleSteer(tire: ReferenceCarSpec["tire"]["coefficients"], m: number, L: number, frontWeight: number, g: number): number {
  const a = L * (1 - frontWeight);
  const b = L * frontWeight;
  const axle = (alpha: number, fz: number) => {
    const out = magicFormula(tire, { kappa: 0, alpha, gamma: 0, fz });
    return { force: 2 * Math.abs(out.fy), moment: 2 * Math.abs(out.mz) };
  };
  const fzFront = (m * 9.81 * frontWeight) / 2;
  const fzRear = (m * 9.81 * (1 - frontWeight)) / 2;
  const solve = (wanted: (alpha: number) => number) => {
    let lo = 0;
    let hi = 0.1;
    for (let i = 0; i < 60; i += 1) {
      const mid = 0.5 * (lo + hi);
      if (wanted(mid) < 0) lo = mid;
      else hi = mid;
    }
    return 0.5 * (lo + hi);
  };
  const rearFor = (alphaFront: number) => {
    const front = axle(alphaFront, fzFront);
    return solve((alpha) => {
      const rear = axle(alpha, fzRear);
      return rear.force * b + rear.moment - (front.force * a - front.moment);
    });
  };
  const alphaFront = solve((alpha) => axle(alpha, fzFront).force + axle(rearFor(alpha), fzRear).force - m * 9.81 * g);
  return ((alphaFront - rearFor(alphaFront)) * 180) / Math.PI;
}

// Sanity check against the bicycle model: with no camber change, no compliance, an open differential and a low centre
// of mass and no anti-roll bars (little load transfer), the multi-body car's understeer gradient matches the analytic one;
// what is left is the remaining load transfer, rolling drag and turn slip, which the bicycle model leaves out.
describe("reference car against the analytic bicycle model", () => {
  for (const frontWeight of [0.4, 0.6]) {
    test(`understeer gradient at ${frontWeight * 100}% front weight within 0.08 deg/g`, () => {
      const base = MAZDA_MX5_ND.spec;
      const spec: ReferenceCarSpec = {
        ...base,
        frontWeight,
        comHeight: 0.05,
        differential: { kind: "open" },
        front: { ...base.front, geometry: parallelogram(base.front.geometry.wheelCenter[1]), compliance: {}, antiRollRate: 0 },
        rear: { ...base.rear, geometry: parallelogram(base.rear.geometry.wheelCenter[1]), compliance: {}, antiRollRate: 0 },
        steering: { ...base.steering, compliance: 0 },
      };
      const low = steadyPoint(spec, 7.5);
      const high = steadyPoint(spec, 11.5);
      const measured = (high.dynamic - low.dynamic) / (high.g - low.g);
      const bicycle = (g: number) => bicycleSteer(base.tire.coefficients, spec.massKg, spec.wheelbase, frontWeight, g);
      const analytic = (bicycle(high.g) - bicycle(low.g)) / (high.g - low.g);
      expect(Math.abs(measured - analytic)).toBeLessThan(0.08);
    }, 30000);
  }
});

// RK4 at the default 0.5 ms step: halving it again moves a launch, a corner and a stop by under 5 mm, and the
// change shrinks by far more than the halving, so the step is converged.
describe("integrator convergence", () => {
  test("halving the step converges", () => {
    const run = (step: number) => {
      const car = createReferenceCar({ ...MAZDA_MX5_ND.spec, step });
      let state = car.tick(0.01, NEUTRAL);
      for (let i = 0; i < 300; i += 1) state = car.tick(0.01, { ...NEUTRAL, throttle: 1 });
      for (let i = 0; i < 100; i += 1) state = car.tick(0.01, { ...NEUTRAL, throttle: 0.4, steer: 0.3 });
      for (let i = 0; i < 50; i += 1) state = car.tick(0.01, { ...NEUTRAL, brake: 0.6, steer: 0.3 });
      return [...state.motion.position, state.motion.forwardSpeed, state.motion.lateralSpeed, state.motion.yawRate];
    };
    const gap = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((value, i) => Math.abs(value - (b[i] ?? 0))));
    const [coarse, base, fine] = [1 / 1000, 1 / 2000, 1 / 4000].map(run);
    if (coarse === undefined || base === undefined || fine === undefined) throw new Error("missing run");
    expect(gap(base, fine)).toBeLessThan(0.005);
    expect(gap(coarse, base) / gap(base, fine)).toBeGreaterThan(8);
  }, 60000);
});
