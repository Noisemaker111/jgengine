import { describe, expect, test } from "bun:test";
import { lookAt, solveFabrik, solveTwoBone, type MutableVec3 } from "./ikSolver";

const close = (actual: readonly number[], expected: readonly number[], precision = 6) => {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i += 1) expect(actual[i]).toBeCloseTo(expected[i]!, precision);
};

describe("solveTwoBone", () => {
  test("bends a unit two-bone chain toward the pole", () => {
    const out = { mid: [0, 0, 0] as MutableVec3, tip: [0, 0, 0] as MutableVec3 };
    solveTwoBone({ root: [0, 0, 0], mid: [1, 0, 0], tip: [2, 0, 0], target: [1, 1, 0], pole: [0, 0, 1] }, out);
    close(out.mid, [0.5, 0.5, Math.sqrt(0.5)]);
    close(out.tip, [1, 1, 0]);
  });

  test("clamps a target beyond maximum reach", () => {
    const out = { mid: [0, 0, 0] as MutableVec3, tip: [0, 0, 0] as MutableVec3 };
    solveTwoBone({ root: [0, 0, 0], mid: [1, 0, 0], tip: [2, 0, 0], target: [4, 0, 0], pole: [0, 1, 0] }, out);
    close(out.mid, [1, 0, 0]);
    close(out.tip, [2, 0, 0]);
  });
});

describe("solveFabrik", () => {
  test("reaches a target while preserving segment lengths", () => {
    const result = solveFabrik([[0, 0, 0], [1, 0, 0], [2, 0, 0]], [1, 1, 0], { iterations: 20, tolerance: 1e-7 });
    close(result[0]!, [0, 0, 0]);
    close(result[2]!, [1, 1, 0], 5);
    expect(Math.hypot(...result[1]!) ).toBeGreaterThan(0);
    expect(Math.hypot(result[1]![0] - result[0]![0], result[1]![1] - result[0]![1], result[1]![2] - result[0]![2])).toBeCloseTo(1);
    expect(Math.hypot(result[2]![0] - result[1]![0], result[2]![1] - result[1]![1], result[2]![2] - result[1]![2])).toBeCloseTo(1);
  });
});

describe("lookAt", () => {
  test("returns identity for the +Z direction", () => close(lookAt({ from: [0, 0, 0], target: [0, 0, 1], up: [0, 1, 0] }), [0, 0, 0, 1]));
  test("limits yaw", () => {
    const quaternion = lookAt({ from: [0, 0, 0], target: [1, 0, 0], up: [0, 1, 0], maxYaw: Math.PI / 4 });
    expect(quaternion[1]).toBeCloseTo(Math.sin(Math.PI / 8));
  });
});
