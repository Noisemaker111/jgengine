import { describe, expect, test } from "bun:test";
import {
  add,
  cross,
  distance,
  distanceSquared,
  dot,
  length,
  lengthSquared,
  lerp,
  negate,
  normalize,
  scale,
  sub,
} from "./vec3";

describe("vec3 arithmetic", () => {
  test("add/sub/scale/negate", () => {
    expect(add([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(sub([5, 5, 5], [1, 2, 3])).toEqual([4, 3, 2]);
    expect(scale([2, 3, 4], 2)).toEqual([4, 6, 8]);
    expect(negate([1, -2, 3])).toEqual([-1, 2, -3]);
  });
  test("dot/cross", () => {
    expect(dot([1, 0, 0], [0, 1, 0])).toBe(0);
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(cross([0, 1, 0], [1, 0, 0])).toEqual([0, 0, -1]);
  });
  test("length/distance", () => {
    expect(length([2, 3, 6])).toBe(7);
    expect(lengthSquared([1, 2, 2])).toBe(9);
    expect(distance([0, 0, 0], [2, 3, 6])).toBe(7);
    expect(distanceSquared([1, 1, 1], [1, 4, 5])).toBe(25);
  });
  test("normalize is unit, zero stays zero", () => {
    expect(length(normalize([2, 3, 6]))).toBeCloseTo(1);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
  test("lerp interpolates each axis", () => {
    expect(lerp([0, 0, 0], [10, 20, 30], 0.5)).toEqual([5, 10, 15]);
    expect(lerp([1, 2, 3], [1, 2, 3], 0.25)).toEqual([1, 2, 3]);
  });
});
