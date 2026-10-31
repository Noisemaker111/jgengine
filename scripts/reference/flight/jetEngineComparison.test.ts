import { describe, expect, test } from "bun:test";

import type { RigidAircraftTuning } from "@jgengine/core/flight/aircraftDynamics";
import { compareJetEngines } from "./jetEngineComparison";

const jet: RigidAircraftTuning = {
  massKg: 9000,
  inertia: { pitch: 60000, yaw: 70000, roll: 15000 },
  surfaces: [
    { at: [2.5, 0, 0], area: 14, liftSlope: 4.5, stallAngle: 0.3, incidence: 0.035 },
    { at: [-2.5, 0, 0], area: 14, liftSlope: 4.5, stallAngle: 0.3, incidence: 0.035 },
    { at: [0, 0, -6], area: 6, liftSlope: 4 },
    { at: [0, 1, -6], normal: [1, 0, 0], area: 4, liftSlope: 4 },
  ],
  engine: { maxThrust: 80000, spoolRate: 1.5 },
  dragArea: 1,
  gear: { height: 1.5 },
};

describe("compareJetEngines", () => {
  test("shows a constant-thrust game jet against the F100 cycle's lapse, afterburner and spool time", () => {
    const [comparison, ...rest] = compareJetEngines([{ name: "test jet", tuning: jet, afterburner: 1.5 }, { name: "light", tuning: { ...jet, massKg: 1000 } }]);
    expect(rest).toHaveLength(0);
    const rows = comparison?.rows ?? [];
    expect(rows.map((row) => row.unit)).toEqual(["N", "ratio", "ratio", "ratio", "ratio", "s"]);
    const [sls, seaDash, mid, high, afterburner, spool] = rows;
    expect(sls?.game).toBeCloseTo(80000, 0);
    for (const row of [seaDash, mid, high]) expect(row?.game).toBeCloseTo(1, 6);
    // The real F100 keeps about a quarter of its static thrust at 40 000 ft, Mach 0.9.
    expect(high?.reference ?? 1).toBeLessThan(0.35);
    expect(afterburner?.game).toBe(1.5);
    expect(afterburner?.reference ?? 0).toBeCloseTo(23770 / 14590, 1);
    expect(spool?.game ?? 0).toBeCloseTo(Math.log(10) / 1.5, 1);
    expect(Math.abs((spool?.reference ?? 0) - 3.91)).toBeLessThan(0.4);
  });
});
