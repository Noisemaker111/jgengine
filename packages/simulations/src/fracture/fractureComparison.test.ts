import { describe, expect, test } from "bun:test";

import { compareFracture, formatFractureComparison } from "./fractureComparison";

describe("fracture comparison", () => {
  test("fractureRock follows the t10 law and the 0.5–5% energy share; the structure debris paths keep whole pieces", () => {
    const rows = compareFracture();
    for (const row of rows.filter((entry) => entry.subject === "fractureRock")) {
      expect(Math.abs(row.t10 - row.lawT10)).toBeLessThan(Math.max(4, 0.2 * row.lawT10));
      expect(row.kineticShare).toBeGreaterThan(0.005);
      expect(row.kineticShare).toBeLessThan(0.05);
    }
    for (const row of rows.filter((entry) => entry.subject !== "fractureRock")) {
      expect(row.t10).toBe(0);
      expect(row.pieces).toBe(8);
    }
    expect(formatFractureComparison(rows).split("\n")).toHaveLength(2 + rows.length);
  });
});
