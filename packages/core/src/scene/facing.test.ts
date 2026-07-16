import { describe, expect, test } from "bun:test";

import { DEFAULT_FORWARD, yawToFace } from "./facing";

describe("yawToFace", () => {
  test("no rotation needed when forward already points at the target", () => {
    expect(yawToFace(DEFAULT_FORWARD, [0, 0], [0, 5])).toBeCloseTo(0);
  });

  test("flips 180° when the target is directly behind", () => {
    expect(yawToFace(DEFAULT_FORWARD, [0, 0], [0, -5])).toBeCloseTo(Math.PI);
  });

  test("turns 90° toward a target on either side", () => {
    expect(yawToFace(DEFAULT_FORWARD, [0, 0], [5, 0])).toBeCloseTo(Math.PI / 2);
    expect(yawToFace(DEFAULT_FORWARD, [0, 0], [-5, 0])).toBeCloseTo(-Math.PI / 2);
  });

  test("accounts for a non-default declared forward", () => {
    const forwardX: [number, number, number] = [1, 0, 0];
    expect(yawToFace(forwardX, [0, 0], [1, 0])).toBeCloseTo(0);
    expect(yawToFace(forwardX, [0, 0], [0, 1])).toBeCloseTo(-Math.PI / 2);
  });

  test("is relative to origin, not just the world center", () => {
    expect(yawToFace(DEFAULT_FORWARD, [2, 2], [2, 7])).toBeCloseTo(0);
    expect(yawToFace(DEFAULT_FORWARD, [2, 2], [7, 2])).toBeCloseTo(Math.PI / 2);
  });

  test("returns 0 when origin and target coincide", () => {
    expect(yawToFace(DEFAULT_FORWARD, [3, 4], [3, 4])).toBe(0);
  });
});
