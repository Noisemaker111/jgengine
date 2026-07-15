import { describe, expect, test } from "bun:test";

import { catenaryCurve, sagCurve } from "./catenary";

describe("sagCurve", () => {
  test("droops the mid-span by exactly `sag` below the chord", () => {
    const points = sagCurve([0, 10, 0], [10, 10, 0], 2, 8);
    expect(points[4]![1]).toBeCloseTo(8, 5);
    expect(points[0]).toEqual([0, 10, 0]);
    expect(points[points.length - 1]).toEqual([10, 10, 0]);
  });

  test("returns segments+1 points", () => {
    expect(sagCurve([0, 0, 0], [1, 0, 0], 0.5, 12)).toHaveLength(13);
  });
});

describe("catenaryCurve", () => {
  test("keeps endpoints and droops between them", () => {
    const points = catenaryCurve([0, 10, 0], [20, 10, 0], 0.15, 16);
    expect(points[0]![1]).toBeCloseTo(10, 4);
    expect(points[16]![1]).toBeCloseTo(10, 4);
    expect(points[8]![1]).toBeLessThan(10);
  });

  test("more slack droops deeper", () => {
    const shallow = catenaryCurve([0, 10, 0], [20, 10, 0], 0.05, 16);
    const deep = catenaryCurve([0, 10, 0], [20, 10, 0], 0.3, 16);
    expect(deep[8]![1]).toBeLessThan(shallow[8]![1]);
  });

  test("interpolates the chord for uneven anchor heights", () => {
    const points = catenaryCurve([0, 10, 0], [20, 14, 0], 0.1, 16);
    expect(points[0]![1]).toBeCloseTo(10, 4);
    expect(points[16]![1]).toBeCloseTo(14, 4);
  });
});
