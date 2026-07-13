import { describe, expect, test } from "bun:test";
import {
  add,
  cross,
  distance,
  dot,
  fromHeading,
  heading,
  length,
  lerp,
  normalize,
  normalizeAngle,
  normalizeAngleDeg,
  perp,
  reflect,
  rotate,
  scale,
  sub,
} from "./vec2";

describe("vec2 arithmetic", () => {
  test("add/sub/scale", () => {
    expect(add([1, 2], [3, 4])).toEqual([4, 6]);
    expect(sub([5, 5], [1, 2])).toEqual([4, 3]);
    expect(scale([2, 3], 2)).toEqual([4, 6]);
  });
  test("dot/cross", () => {
    expect(dot([1, 0], [0, 1])).toBe(0);
    expect(dot([2, 3], [4, 5])).toBe(23);
    expect(cross([1, 0], [0, 1])).toBe(1);
  });
  test("length/distance", () => {
    expect(length([3, 4])).toBe(5);
    expect(distance([0, 0], [3, 4])).toBe(5);
  });
  test("normalize is unit, zero stays zero", () => {
    expect(length(normalize([3, 4]))).toBeCloseTo(1);
    expect(normalize([0, 0])).toEqual([0, 0]);
  });
  test("lerp and perp", () => {
    expect(lerp([0, 0], [10, 20], 0.5)).toEqual([5, 10]);
    const p = perp([1, 0]);
    expect(p[0]).toBeCloseTo(0);
    expect(p[1]).toBeCloseTo(1);
  });
});

describe("vec2 angles", () => {
  test("fromHeading and heading round-trip", () => {
    const v = fromHeading(0.7);
    expect(heading(v)).toBeCloseTo(0.7);
  });
  test("rotate by 90deg", () => {
    const r = rotate([1, 0], Math.PI / 2);
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo(1);
  });
  test("normalizeAngle wraps into range", () => {
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeAngleDeg(-90)).toBe(270);
    expect(normalizeAngleDeg(450)).toBe(90);
  });
  test("reflect mirrors the normal component elastically", () => {
    const r = reflect([1, -1], [0, 1]);
    expect(r[0]).toBeCloseTo(1);
    expect(r[1]).toBeCloseTo(1);
  });
  test("reflect with restitution 0 removes the normal component (slide)", () => {
    const r = reflect([2, -3], [0, 1], 0);
    expect(r[0]).toBeCloseTo(2);
    expect(r[1]).toBeCloseTo(0);
  });
  test("reflect keeps tangential motion and scales bounce by restitution", () => {
    const r = reflect([1, -1], [0, 1], 0.5);
    expect(r[0]).toBeCloseTo(1);
    expect(r[1]).toBeCloseTo(0.5);
  });
});
