import { describe, expect, test } from "bun:test";

import { heightForCount } from "./palette";

describe("commit canopy height mapping", () => {
  test("every extra commit is a taller bar — no plateau, no clip", () => {
    let prev = -Infinity;
    for (let count = 0; count <= 300; count += 1) {
      const h = heightForCount(count);
      expect(h).toBeGreaterThan(prev);
      prev = h;
    }
  });

  test("busy days stay distinguishable instead of flattening to one height", () => {
    expect(heightForCount(60)).toBeGreaterThan(heightForCount(15));
    expect(heightForCount(200)).toBeGreaterThan(heightForCount(60));
  });

  test("tall bars stay within a sane world-height bound", () => {
    expect(heightForCount(0)).toBeCloseTo(0.1);
    expect(heightForCount(300)).toBeLessThan(6);
  });
});
