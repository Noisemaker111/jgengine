import { describe, expect, test } from "bun:test";

import { measureHandling } from "@jgengine/core/physics/handlingProbe";
import { createVehicleDynamics } from "@jgengine/core/physics/vehicleDynamics";

import { handlingDemoTuning } from "./handlingTuning";

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
});
