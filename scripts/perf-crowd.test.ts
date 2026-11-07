import { describe, expect, test } from "bun:test";

import { createEngineCrowd, createFlatCrowd } from "./perf-crowd";

describe("perf crowd", () => {
  test("the engine path and the flat reference step the same crowd to the same place", () => {
    const engine = createEngineCrowd(400);
    const flat = createFlatCrowd(400);
    for (let tick = 0; tick < 20; tick += 1) {
      engine.step();
      flat.step();
    }
    const a = engine.positions();
    const b = flat.positions();
    let worst = 0;
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]!).toBeGreaterThanOrEqual(0);
      expect(a[i]!).toBeLessThanOrEqual(engine.side);
      worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
    }
    expect(worst).toBeLessThan(1e-3);
  });

  test("separation pushes overlapping agents apart", () => {
    const crowd = createEngineCrowd(400);
    const closest = (positions: Float64Array): number => {
      let total = 0;
      for (let i = 0; i < positions.length; i += 2) {
        let best = Infinity;
        for (let j = 0; j < positions.length; j += 2) {
          if (i !== j) best = Math.min(best, Math.hypot(positions[i]! - positions[j]!, positions[i + 1]! - positions[j + 1]!));
        }
        total += best;
      }
      return total;
    };
    const before = closest(crowd.positions());
    for (let tick = 0; tick < 60; tick += 1) crowd.step();
    expect(closest(crowd.positions())).toBeGreaterThan(before);
  });
});
