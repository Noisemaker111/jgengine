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
});
