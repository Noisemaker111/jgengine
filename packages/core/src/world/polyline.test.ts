import { describe, expect, test } from "bun:test";
import type { Vec2 } from "./geometry";
import { closestPoint, pointAtDistance, pointAtFraction, polyline, tangentAtDistance } from "./polyline";

const L: readonly Vec2[] = [
  [0, 0],
  [10, 0],
  [10, 10],
];

describe("polyline", () => {
  test("total length is sum of segments", () => {
    expect(polyline(L).length).toBe(20);
  });
  test("pointAtDistance walks the corner", () => {
    const line = polyline(L);
    expect(pointAtDistance(line, 5)).toEqual([5, 0]);
    expect(pointAtDistance(line, 10)).toEqual([10, 0]);
    expect(pointAtDistance(line, 15)).toEqual([10, 5]);
  });
  test("clamps past the ends", () => {
    const line = polyline(L);
    expect(pointAtDistance(line, -3)).toEqual([0, 0]);
    expect(pointAtDistance(line, 999)).toEqual([10, 10]);
  });
  test("pointAtFraction uses total length", () => {
    expect(pointAtFraction(polyline(L), 0.5)).toEqual([10, 0]);
  });
  test("tangent is the segment direction", () => {
    const line = polyline(L);
    expect(tangentAtDistance(line, 3)).toEqual([1, 0]);
    expect(tangentAtDistance(line, 15)).toEqual([0, 1]);
  });
  test("closestPoint projects onto the line", () => {
    const hit = closestPoint(polyline(L), [5, 4]);
    expect(hit.point).toEqual([5, 0]);
    expect(hit.distanceAlong).toBeCloseTo(5);
    expect(hit.segment).toBe(0);
    expect(Math.abs(hit.lateral)).toBeCloseTo(4);
  });
  test("closestPoint keeps searching past a negative-lateral segment (#995)", () => {
    // A spur that doubles back downward: the query's true nearest point sits on the second
    // segment (~0.5 away), but its projection onto the first segment lands on the negative
    // side (~8 away). The old comparison stored that segment's *signed* lateral and then tested
    // the next candidate's *unsigned* distance against it, so once the negative value landed the
    // search froze on the wrong segment. Magnitudes must be compared consistently.
    const spur: readonly Vec2[] = [
      [0, 0],
      [10, 0],
      [10, -10],
    ];
    const hit = closestPoint(polyline(spur), [10.5, -8]);
    expect(hit.segment).toBe(1);
    expect(hit.point[0]).toBeCloseTo(10);
    expect(hit.point[1]).toBeCloseTo(-8);
    expect(Math.abs(hit.lateral)).toBeCloseTo(0.5);
    expect(hit.distanceAlong).toBeCloseTo(18);
  });
});
