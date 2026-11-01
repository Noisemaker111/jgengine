import { describe, expect, test } from "bun:test";

import { engineTorque, torqueCurveShiftSeconds } from "./engineTorqueCurve";
import type { VehicleGearboxTuning } from "./vehicleDynamics";

const box: VehicleGearboxTuning = {
  kind: "gearbox",
  peakTorque: 201,
  torqueCurve: { points: [[0, 0.7], [0.6, 1], [1, 0.82]] },
  idleRpm: 750,
  redlineRpm: 6800,
  shiftUpRpm: 6650,
  shiftDownRpm: 2720,
  shiftSeconds: 0.25,
  gears: [5.087, 2.991, 2.035, 1.594, 1.286, 1],
  reverseGear: 5.087,
  finalDrive: 2.866,
  wheelRadius: 0.308,
};
const curve = [[1000, 140], [4600, 201], [6800, 165]] as const;

describe("engineTorque", () => {
  test("full throttle reads the published curve, closed throttle the friction that rises with rpm", () => {
    expect(engineTorque({ curve }, box, 4600, 1, 1)).toBeCloseTo(201, 9);
    expect(engineTorque({ curve }, box, 2800, 1, 1)).toBeCloseTo(170.5, 9);
    const idle = engineTorque({ curve }, box, 1000, 0, 1);
    const high = engineTorque({ curve }, box, 6800, 0, 1);
    expect(idle).toBeLessThan(0);
    expect(high).toBeCloseTo(-0.18 * 201, 9);
    expect(high).toBeLessThan(idle);
  });

  test("part throttle sits between the curve and the friction", () => {
    const half = engineTorque({ curve }, box, 4600, 0.5, 1);
    expect(half).toBeCloseTo(0.5 * 201 - 0.5 * 0.18 * 201 * (1 / 3 + (2 / 3) * (4600 / 6800)), 9);
  });

  test("the dial flattens the curve and the friction at 0 and deepens them past 1, monotone and bounded", () => {
    const at = (strength: number) => engineTorque({ curve }, box, 1000, 1, strength);
    expect(at(0)).toBe(201);
    const values = [0, 0.2, 1, 2, 4, 40].map(at);
    for (let i = 1; i < values.length; i += 1) expect(values[i] ?? 0).toBeLessThanOrEqual(values[i - 1] ?? 0);
    expect(values[values.length - 1] ?? 0).toBeGreaterThan(0);
    expect(engineTorque({ curve }, box, 5000, 0, 0)).toBeCloseTo(0, 12);
    expect(torqueCurveShiftSeconds({}, box, 2)).toBeCloseTo(0.5, 12);
  });

  test("without a published curve it reads the powertrain's normalised one", () => {
    expect(engineTorque({}, box, 750 + 0.6 * (6800 - 750), 1, 1)).toBeCloseTo(201, 9);
  });
});
