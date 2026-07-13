import { describe, expect, test } from "bun:test";

import { radialImpulse } from "./radialImpulse";

describe("radialImpulse", () => {
  test("pushes the target directly away with linear falloff", () => {
    const push = radialImpulse([0, 0], [2, 0], 4, 10)!;
    expect(push.falloff).toBeCloseTo(0.5);
    expect(push.magnitude).toBeCloseTo(5);
    expect(push.x).toBeCloseTo(5);
    expect(push.y).toBeCloseTo(0);
  });

  test("returns null at or beyond the radius", () => {
    expect(radialImpulse([0, 0], [4, 0], 4, 10)).toBeNull();
    expect(radialImpulse([0, 0], [5, 0], 4, 10)).toBeNull();
    expect(radialImpulse([0, 0], [1, 0], 0, 10)).toBeNull();
  });

  test("quadratic falloff drops off faster than linear", () => {
    const lin = radialImpulse([0, 0], [2, 0], 4, 10, { falloff: "linear" })!;
    const quad = radialImpulse([0, 0], [2, 0], 4, 10, { falloff: "quadratic" })!;
    expect(quad.magnitude).toBeLessThan(lin.magnitude);
    expect(quad.falloff).toBeCloseTo(0.25);
  });

  test("none keeps full power everywhere inside the radius", () => {
    const push = radialImpulse([0, 0], [3, 0], 4, 10, { falloff: "none" })!;
    expect(push.magnitude).toBeCloseTo(10);
  });

  test("zero direction at the exact center", () => {
    const push = radialImpulse([1, 1], [1, 1], 4, 10)!;
    expect(push.x).toBe(0);
    expect(push.y).toBe(0);
    expect(push.falloff).toBeCloseTo(1);
  });
});
