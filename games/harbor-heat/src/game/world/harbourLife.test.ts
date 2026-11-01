import { describe, expect, test } from "bun:test";

import { CIRCUITS, circuitPose } from "./harbourLife";

describe("harbour life", () => {
  test("the scene document authors boats in the bay and a helicopter over the city", () => {
    const vessels = CIRCUITS.map((circuit) => circuit.vessel);
    expect(vessels.filter((vessel) => vessel === "boat_sail").length).toBeGreaterThanOrEqual(2);
    expect(vessels).toContain("boat_runabout");
    expect(vessels).toContain("heli_ambient");
  });

  test("a circuit closes on itself and heads along each leg", () => {
    for (const circuit of CIRCUITS) {
      const total = circuit.lengths[circuit.lengths.length - 1]!;
      const start = circuitPose(circuit, 0);
      const lap = circuitPose(circuit, total);
      expect(lap.x).toBeCloseTo(start.x, 6);
      expect(lap.z).toBeCloseTo(start.z, 6);
      const next = circuitPose(circuit, 1);
      expect(Math.atan2(next.x - start.x, next.z - start.z)).toBeCloseTo(start.heading, 2);
    }
  });
});
