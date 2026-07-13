import { describe, expect, test } from "bun:test";

import { circleVsSegment, closestPointOnSegment } from "./segment";

describe("closestPointOnSegment", () => {
  test("projects onto the segment interior", () => {
    const { point, t } = closestPointOnSegment([2, 3], [0, 0], [4, 0]);
    expect(point).toEqual([2, 0]);
    expect(t).toBeCloseTo(0.5);
  });

  test("clamps past the endpoints", () => {
    expect(closestPointOnSegment([-5, 1], [0, 0], [4, 0]).t).toBe(0);
    expect(closestPointOnSegment([9, 1], [0, 0], [4, 0]).t).toBe(1);
  });
});

describe("circleVsSegment", () => {
  test("returns null when the circle clears the segment", () => {
    expect(circleVsSegment([2, 5], 1, [0, 0], [4, 0])).toBeNull();
  });

  test("resolves a contact with an outward normal and separated center", () => {
    const hit = circleVsSegment([2, 0.5], 1, [0, 0], [4, 0])!;
    expect(hit.normal[0]).toBeCloseTo(0);
    expect(hit.normal[1]).toBeCloseTo(1);
    expect(hit.depth).toBeCloseTo(0.5);
    expect(hit.contact).toEqual([2, 0]);
    expect(hit.resolved[1]).toBeCloseTo(1);
  });

  test("rounds the endpoints as a capsule", () => {
    const hit = circleVsSegment([-0.5, 0], 1, [0, 0], [4, 0], 0.2)!;
    expect(hit.contact).toEqual([0, 0]);
    expect(hit.normal[0]).toBeCloseTo(-1);
    expect(hit.depth).toBeCloseTo(0.7);
  });

  test("thickness widens the contact reach", () => {
    expect(circleVsSegment([2, 1.5], 1, [0, 0], [4, 0], 0)).toBeNull();
    expect(circleVsSegment([2, 1.5], 1, [0, 0], [4, 0], 1)).not.toBeNull();
  });
});
