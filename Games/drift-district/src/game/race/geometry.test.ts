import { describe, expect, test } from "bun:test";

import {
  cumulativeLengths,
  distance,
  offsetLateral,
  polylineLength,
  sampleAtDistance,
  tangentAt,
  vecNormalize,
} from "./geometry";

describe("race geometry", () => {
  const square: readonly [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];

  test("polylineLength sums segment distances", () => {
    expect(polylineLength(square)).toBeCloseTo(20, 5);
  });

  test("cumulativeLengths is monotonically increasing and starts at 0", () => {
    const lengths = cumulativeLengths(square);
    expect(lengths[0]).toBe(0);
    expect(lengths[1]).toBeCloseTo(10, 5);
    expect(lengths[2]).toBeCloseTo(20, 5);
  });

  test("sampleAtDistance interpolates within a segment", () => {
    const lengths = cumulativeLengths(square);
    const mid = sampleAtDistance(square, lengths, 5);
    expect(mid[0]).toBeCloseTo(5, 5);
    expect(mid[1]).toBeCloseTo(0, 5);
  });

  test("sampleAtDistance clamps beyond the polyline end", () => {
    const lengths = cumulativeLengths(square);
    const end = sampleAtDistance(square, lengths, 999);
    expect(end[0]).toBeCloseTo(10, 5);
    expect(end[1]).toBeCloseTo(10, 5);
  });

  test("sampleAtDistance clamps before the polyline start", () => {
    const lengths = cumulativeLengths(square);
    const start = sampleAtDistance(square, lengths, -50);
    expect(start[0]).toBeCloseTo(0, 5);
    expect(start[1]).toBeCloseTo(0, 5);
  });

  test("tangentAt reports the unit direction of the active segment", () => {
    const lengths = cumulativeLengths(square);
    const t0 = tangentAt(square, lengths, 2);
    expect(t0[0]).toBeCloseTo(1, 5);
    expect(t0[1]).toBeCloseTo(0, 5);
    const t1 = tangentAt(square, lengths, 15);
    expect(t1[0]).toBeCloseTo(0, 5);
    expect(t1[1]).toBeCloseTo(1, 5);
  });

  test("vecNormalize returns a unit vector", () => {
    const n = vecNormalize([3, 4]);
    expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 5);
  });

  test("offsetLateral pushes a point perpendicular to the from->toward direction", () => {
    const offset = offsetLateral([0, 0], [0, 10], 5);
    expect(distance([0, 0], offset)).toBeCloseTo(5, 5);
    expect(offset[1]).toBeCloseTo(0, 5);
  });
});
