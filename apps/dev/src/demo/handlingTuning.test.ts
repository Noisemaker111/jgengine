import { describe, expect, test } from "bun:test";

import { measureAir, measureCourse, measureHandling } from "@jgengine/core/physics/handlingProbe";
import { createVehicleDynamics } from "@jgengine/core/physics/vehicleDynamics";

import { handlingDemoGround, handlingDemoTuning } from "./handlingTuning";

describe("handling demo car", () => {
  const report = measureHandling(() => createVehicleDynamics(handlingDemoTuning));

  test("is quick and grippy like a street sports car", () => {
    expect(report.zeroTo100).toBeLessThan(5.5);
    expect(report.maxLateralG).toBeGreaterThan(1);
    expect(report.brake100To0).toBeLessThan(42);
    expect(report.turnIn).toBeLessThan(0.3);
  });

  test("survives held keyboard input: full steer at speed and full throttle with full steer", () => {
    expect(report.spun).toBe(false);
    expect(report.stepPeakSideslipDeg).toBeLessThan(12);
    expect(report.powerSteerSpun).toBe(false);
    expect(measureHandling(() => createVehicleDynamics(handlingDemoTuning), { cornerSpeed: 40 }).spun).toBe(false);
  });

  test("slides on the handbrake and catches itself", () => {
    expect(report.handbrakePeakSideslipDeg).toBeGreaterThan(35);
    expect(report.handbrakePeakSideslipDeg).toBeLessThan(75);
  });

  test("jumps the kicker ramp at full throttle and lands straight", () => {
    const car = createVehicleDynamics(handlingDemoTuning, { groundHeight: handlingDemoGround });
    const input = { throttle: 1, brake: 0, steer: 0, handbrake: 0 };
    let airborne = 0;
    let landing = 0;
    let step = car.tick(1 / 60, input);
    for (let i = 0; i < 900 && step.position[2] < 300; i += 1) {
      step = car.tick(1 / 60, input);
      if (step.airborne) airborne += 1 / 60;
      landing = Math.max(landing, step.landingSpeed);
    }
    expect(airborne).toBeGreaterThan(0.4);
    expect(landing).toBeGreaterThan(2);
    expect(step.airborne).toBe(false);
    expect(Math.abs(step.heading)).toBeLessThan(0.05);
    expect(Math.abs(step.position[0])).toBeLessThan(0.5);
  });

  test("hops about a metre and a half and the air nudges it rather than flipping it", () => {
    const air = measureAir(() => createVehicleDynamics(handlingDemoTuning));
    expect(air.jumpApexHeight).toBeGreaterThan(1.2);
    expect(air.jumpApexHeight).toBeLessThan(1.9);
    expect(air.airPitchRate).toBeLessThanOrEqual(2.5 + 1e-9);
    expect(air.airPitchRate).toBeGreaterThan(1);
  });

  test("is mildly understeering, catches handbrake slides quickly and weaves a slalom", () => {
    const course = measureCourse(() => createVehicleDynamics(handlingDemoTuning), { wheelbase: handlingDemoTuning.wheelbase });
    expect(course.understeerGradient).toBeGreaterThan(0);
    expect(course.understeerGradient).toBeLessThan(1);
    expect(course.slalomSpeed).toBeGreaterThanOrEqual(10);
    expect(report.handbrakeRecoverySeconds).toBeLessThan(1.5);
  });
});
