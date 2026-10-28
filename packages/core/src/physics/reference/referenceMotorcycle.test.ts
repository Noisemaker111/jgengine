import { describe, expect, test } from "bun:test";

import { checkReferenceMotorcycle, measureReferenceMotorcycle } from "./compareHandling";
import type { BikeCourseSubject } from "./motorcycleManeuvers";
import { createRiddenMotorcycle } from "./motorcycleRider";
import { motorcycleMagicFormula, SPORT_FRONT_120_70_ZR17, SPORT_REAR_180_55_ZR17 } from "./motorcycleTire";
import { GSXR1000_SHARP_2004, REAL_MOTORCYCLES } from "./realMotorcycles";
import { createReferenceMotorcycle, motorcycleStraightRunningModes } from "./referenceMotorcycle";

const NEUTRAL = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };

describe("motorcycleMagicFormula (Sharp, Evangelou & Limebeer 2004)", () => {
  test("side force opposes slip, camber thrust pushes toward the lean, both are mirror-symmetric", () => {
    const tire = SPORT_FRONT_120_70_ZR17;
    const slip = motorcycleMagicFormula(tire, { kappa: 0, alpha: 0.05, gamma: 0, fz: 1100 });
    const camber = motorcycleMagicFormula(tire, { kappa: 0, alpha: 0, gamma: 0.5, fz: 1100 });
    expect(slip.fy).toBeLessThan(0);
    expect(camber.fy).toBeLessThan(0);
    expect(motorcycleMagicFormula(tire, { kappa: 0, alpha: -0.05, gamma: 0, fz: 1100 }).fy).toBeCloseTo(-slip.fy, 9);
    expect(motorcycleMagicFormula(tire, { kappa: 0, alpha: 0, gamma: -0.5, fz: 1100 }).fy).toBeCloseTo(-camber.fy, 9);
    // At 0.5 rad of camber the thrust alone carries close to half the load sideways.
    expect(camber.fy / 1100).toBeGreaterThan(-0.6);
    expect(camber.fy / 1100).toBeLessThan(-0.3);
  });

  test("peak friction is road-tyre-like and combined slip shares the grip", () => {
    for (const tire of [SPORT_FRONT_120_70_ZR17, SPORT_REAR_180_55_ZR17]) {
      let peak = 0;
      for (let k = 0.01; k < 0.4; k += 0.01) peak = Math.max(peak, motorcycleMagicFormula(tire, { kappa: k, alpha: 0, gamma: 0, fz: tire.fz0 }).fx / tire.fz0);
      expect(peak).toBeGreaterThan(1.2);
      expect(peak).toBeLessThan(1.5);
      const pure = motorcycleMagicFormula(tire, { kappa: 0, alpha: 0.08, gamma: 0, fz: tire.fz0 }).fy;
      const combined = motorcycleMagicFormula(tire, { kappa: 0.08, alpha: 0.08, gamma: 0, fz: tire.fz0 }).fy;
      expect(Math.abs(combined)).toBeLessThan(Math.abs(pure));
    }
  });
});

describe("createReferenceMotorcycle — Suzuki GSX-R1000 of Sharp, Evangelou & Limebeer (2004)", () => {
  test("fits the bike scenarios and rests on the published static loads", () => {
    const bike = createRiddenMotorcycle(GSXR1000_SHARP_2004);
    const subject: BikeCourseSubject = bike;
    expect(subject).toBe(bike);
    const rest = bike.bike.sample();
    // Static loads from the published mass distribution: 1153 N front, 1306 N rear.
    expect(rest.frontLoad).toBeCloseTo(1153, -1);
    expect(rest.rearLoad).toBeCloseTo(1306, -1);
    for (let i = 0; i < 60; i++) bike.tick(1 / 60, NEUTRAL);
    const after = bike.bike.sample();
    expect(Math.abs(after.lean)).toBeLessThan(1e-6);
    expect(Math.hypot(after.position[0], after.position[2])).toBeLessThan(0.01);
  });

  test("straight-running weave and wobble at 75 m/s land on the paper's root locus (Figure 18)", () => {
    const modes = motorcycleStraightRunningModes(GSXR1000_SHARP_2004, 75);
    // Published (read from Figure 18): wobble ≈ −1.7 ± 47.3i, weave ≈ −0.3 ± 28.5i.
    expect(modes.wobble?.re).toBeCloseTo(-1.7, 0);
    expect(Math.abs((modes.wobble?.im ?? 0) - 47.3)).toBeLessThan(1.5);
    expect(Math.abs((modes.weave?.re ?? 0) + 0.3)).toBeLessThan(0.3);
    expect(Math.abs((modes.weave?.im ?? 0) - 28.5)).toBeLessThan(1);
  });

  test("a frame half as stiff in torsion turns the 75 m/s weave unstable, as the paper finds", () => {
    const spec = { ...GSXR1000_SHARP_2004, frameTwist: { stiffness: 0.5e5, damping: 100 * 0.7071 } };
    const modes = motorcycleStraightRunningModes(spec, 75);
    // Published: ≈ +0.5 ± 29i.
    expect(modes.weave?.re).toBeGreaterThan(0);
    expect(Math.abs((modes.weave?.re ?? 0) - 0.5)).toBeLessThan(0.3);
    expect(Math.abs((modes.weave?.im ?? 0) - 29)).toBeLessThan(1);
  });

  test("weave and wobble are stable through the middle of the speed range", () => {
    for (const speed of [10, 30]) {
      const modes = motorcycleStraightRunningModes(GSXR1000_SHARP_2004, speed);
      expect(modes.weave?.re).toBeLessThan(0);
      expect(modes.wobble?.re).toBeLessThan(0);
    }
  });

  test("countersteer emerges: bar torque to the left leans the bike right and turns it right", () => {
    const bike = createReferenceMotorcycle(GSXR1000_SHARP_2004, { speed: 20 });
    let step = bike.sample();
    let minSteer = 0;
    for (let i = 0; i < 1200; i++) {
      step = bike.step(1 / 1000, { steerTorque: i < 300 ? -8 : 0, driveTorque: 60, feet: false });
      minSteer = Math.min(minSteer, step.steerAngle);
    }
    expect(minSteer).toBeLessThan(0);
    expect(step.lean).toBeGreaterThan(0.02);
    expect(step.yawRate).toBeLessThan(0);
  });

  test("snapshot and restore replay the same ride", () => {
    const bike = createRiddenMotorcycle(GSXR1000_SHARP_2004, { speed: 15 });
    for (let i = 0; i < 30; i++) bike.tick(1 / 60, { ...NEUTRAL, throttle: 0.3, steer: 0.4 });
    const saved = bike.snapshot();
    const a: number[] = [];
    for (let i = 0; i < 30; i++) a.push(bike.tick(1 / 60, { ...NEUTRAL, throttle: 0.3, steer: -0.2 }).lean);
    bike.restore(saved);
    const b: number[] = [];
    for (let i = 0; i < 30; i++) b.push(bike.tick(1 / 60, { ...NEUTRAL, throttle: 0.3, steer: -0.2 }).lean);
    expect(b).toEqual(a);
  });
});

describe("createRiddenMotorcycle", () => {
  test("holds a requested lean with the bar torque alone", () => {
    const bike = createRiddenMotorcycle(GSXR1000_SHARP_2004, { speed: 20 });
    let step = bike.bike.sample();
    for (let i = 0; i < 180; i++) step = bike.tick(1 / 60, { ...NEUTRAL, throttle: 0.3, steer: 0.35 / bike.maxLean });
    expect(Math.abs(step.lean - 0.35)).toBeLessThan(0.03);
    expect(step.yawRate).toBeLessThan(0);
  });
});

describe("reference motorcycle against MOTORRAD's 2001 GSX-R1000 test", () => {
  test("0-100, 0-200 km/h and 100-0 km/h braking land within the published tolerances", () => {
    const bike = REAL_MOTORCYCLES[0];
    if (bike === undefined) throw new Error("no real motorcycle");
    const metrics = measureReferenceMotorcycle(bike, { tests: ["launch", "brake", "lean"] });
    for (const check of checkReferenceMotorcycle(bike, metrics)) expect({ metric: check.metric, pass: check.pass }).toEqual({ metric: check.metric, pass: true });
    expect(metrics.counterSteerDeg).toBeGreaterThan(0);
    expect(metrics.counterLeanDeg).toBeLessThan(0.5);
  }, 60_000);
});
