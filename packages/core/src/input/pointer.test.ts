import { describe, expect, test } from "bun:test";
import { aimToPoint, groundOf, moveTargetFromHit, type PointerHit } from "@jgengine/core/input/pointer";

const HIT: PointerHit = { point: [3, 0, 4], normal: [0, 1, 0], entity: null, object: "chest-1" };

describe("pointer", () => {
  test("aimToPoint returns a normalized origin→point direction", () => {
    const aim = aimToPoint([0, 0, 0], [3, 0, 4]);
    expect("direction" in aim).toBe(true);
    if ("direction" in aim) {
      const [x, y, z] = aim.direction;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1);
      expect(x).toBeCloseTo(0.6);
      expect(z).toBeCloseTo(0.8);
    }
  });

  test("aimToPoint on a zero-length vector falls back to forward", () => {
    const aim = aimToPoint([1, 1, 1], [1, 1, 1]);
    if ("direction" in aim) expect(aim.direction).toEqual([0, 0, 1]);
  });

  test("moveTargetFromHit returns the world point", () => {
    expect(moveTargetFromHit(HIT)).toEqual([3, 0, 4]);
  });

  test("groundOf drops the y component for navmesh routing", () => {
    expect(groundOf(HIT)).toEqual([3, 4]);
  });
});
