import { describe, expect, test } from "bun:test";
import { measureHandling } from "@jgengine/core/physics/handlingProbe";
import { createVehicleDynamics } from "@jgengine/core/physics/vehicleDynamics";

import { BASE_TUNING } from "./race";

describe("the stock car's feel", () => {
  const report = measureHandling(() => createVehicleDynamics(BASE_TUNING));

  test("arcade quick: 0-100 under 3.5 s, tops out at 36 m/s, stops from 100 in under 25 m", () => {
    expect(report.zeroTo100).toBeLessThan(3.5);
    expect(report.topSpeed).toBeCloseTo(36, 0);
    expect(report.brake100To0).toBeLessThan(25);
  });

  test("grippy and forgiving: 2 g corners, snappy turn-in, never spins on a held key", () => {
    expect(report.maxLateralG).toBeGreaterThan(1.9);
    expect(report.turnIn).toBeLessThan(0.3);
    expect(report.spun).toBe(false);
    expect(report.powerSteerSpun).toBe(false);
  });

  test("the handbrake swings the tail out and the car catches it inside a second", () => {
    expect(report.handbrakePeakSideslipDeg).toBeGreaterThan(45);
    expect(report.handbrakePeakSideslipDeg).toBeLessThan(90);
    expect(report.handbrakeRecoverySeconds).toBeLessThan(1);
  });
});
