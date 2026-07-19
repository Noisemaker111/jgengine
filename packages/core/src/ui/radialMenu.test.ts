import { describe, expect, test } from "bun:test";

import {
  radialIndexFromAngle,
  radialIndexFromVector,
  radialSlicePosition,
  radialSlices,
} from "./radialMenu";

describe("radialSlices", () => {
  test("divides the ring into evenly centered wedges from the top", () => {
    const slices = radialSlices(4);
    expect(slices).toHaveLength(4);
    expect(slices[0]!.centerAngle).toBeCloseTo(0, 5); // top
    expect(slices[1]!.centerAngle).toBeCloseTo(Math.PI / 2, 5); // right
    expect(slices[2]!.centerAngle).toBeCloseTo(Math.PI, 5); // bottom
  });

  test("count 0 yields no slices", () => {
    expect(radialSlices(0)).toEqual([]);
  });
});

describe("radialIndexFromAngle", () => {
  test("snaps an angle to the nearest slice, wrapping", () => {
    expect(radialIndexFromAngle(0, 4)).toBe(0);
    expect(radialIndexFromAngle(Math.PI / 2, 4)).toBe(1);
    expect(radialIndexFromAngle(Math.PI, 4)).toBe(2);
    expect(radialIndexFromAngle(-Math.PI / 2, 4)).toBe(3); // wraps to the left slice
    expect(radialIndexFromAngle(2 * Math.PI - 0.01, 4)).toBe(0); // wraps back to top
  });
});

describe("radialIndexFromVector", () => {
  test("maps screen-space vectors (y down) to slices; up is index 0", () => {
    expect(radialIndexFromVector(0, -1, 4)).toBe(0); // up
    expect(radialIndexFromVector(1, 0, 4)).toBe(1); // right
    expect(radialIndexFromVector(0, 1, 4)).toBe(2); // down
    expect(radialIndexFromVector(-1, 0, 4)).toBe(3); // left
  });

  test("returns null inside the dead zone", () => {
    expect(radialIndexFromVector(0.1, 0.1, 6, { deadZone: 0.5 })).toBeNull();
    expect(radialIndexFromVector(0, -2, 6, { deadZone: 0.5 })).toBe(0);
  });
});

describe("radialSlicePosition", () => {
  test("places index 0 straight up and index at a quarter to the right", () => {
    const up = radialSlicePosition(0, 4, 10);
    expect(up.x).toBeCloseTo(0, 5);
    expect(up.y).toBeCloseTo(-10, 5);
    const right = radialSlicePosition(1, 4, 10);
    expect(right.x).toBeCloseTo(10, 5);
    expect(right.y).toBeCloseTo(0, 5);
  });
});
