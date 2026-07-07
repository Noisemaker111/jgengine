import { describe, expect, test } from "bun:test";

import { computeFalloffGain, distance3, resolveEmitterGain } from "./audioFalloff";

describe("computeFalloffGain", () => {
  test("full gain at or under minDistance", () => {
    expect(computeFalloffGain(0, { minDistance: 2, maxDistance: 10 })).toBe(1);
    expect(computeFalloffGain(2, { minDistance: 2, maxDistance: 10 })).toBe(1);
  });

  test("zero gain at or beyond maxDistance", () => {
    expect(computeFalloffGain(10, { minDistance: 2, maxDistance: 10 })).toBe(0);
    expect(computeFalloffGain(50, { minDistance: 2, maxDistance: 10 })).toBe(0);
  });

  test("linear curve ramps down between min and max", () => {
    const config = { minDistance: 0, maxDistance: 10, curve: "linear" as const };
    expect(computeFalloffGain(5, config)).toBeCloseTo(0.5, 5);
    expect(computeFalloffGain(2.5, config)).toBeCloseTo(0.75, 5);
  });

  test("inverse curve falls off faster near the listener than linear", () => {
    const linear = computeFalloffGain(5, { minDistance: 1, maxDistance: 10, curve: "linear" });
    const inverse = computeFalloffGain(5, { minDistance: 1, maxDistance: 10, curve: "inverse" });
    expect(inverse).toBeLessThan(linear);
    expect(inverse).toBeGreaterThanOrEqual(0);
  });

  test("none curve ignores distance entirely", () => {
    expect(computeFalloffGain(1000, { curve: "none" })).toBe(1);
  });

  test("defaults apply when config is omitted", () => {
    expect(computeFalloffGain(0)).toBe(1);
    expect(computeFalloffGain(100)).toBe(0);
  });

  test("negative distances clamp to zero distance", () => {
    expect(computeFalloffGain(-5, { minDistance: 1, maxDistance: 10 })).toBe(1);
  });
});

describe("resolveEmitterGain", () => {
  test("multiplies base gain, falloff, and bus gain", () => {
    const gain = resolveEmitterGain(
      0,
      { gain: 0.5, positional: true, falloff: { minDistance: 0, maxDistance: 10 } },
      0.8,
    );
    expect(gain).toBeCloseTo(0.4, 5);
  });

  test("non-positional sounds ignore distance", () => {
    const near = resolveEmitterGain(0, { gain: 1, positional: false }, 1);
    const far = resolveEmitterGain(1000, { gain: 1, positional: false }, 1);
    expect(near).toBe(1);
    expect(far).toBe(1);
  });

  test("defaults base gain to 1 when unset", () => {
    const gain = resolveEmitterGain(0, { positional: false }, 1);
    expect(gain).toBe(1);
  });
});

describe("distance3", () => {
  test("computes euclidean distance", () => {
    expect(distance3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });

  test("zero for identical points", () => {
    expect(distance3({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(0);
  });
});
