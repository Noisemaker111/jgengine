import { describe, expect, test } from "bun:test";

import { afterburnerCommand, afterburnerRatio } from "./afterburner";

describe("afterburner", () => {
  test("throttle past the F-16's 77% dry stop lights reheat", () => {
    expect(afterburnerCommand({}, 1, 0.77)).toEqual({ dry: 1, reheat: 0 });
    expect(afterburnerCommand({}, 1, 1)).toEqual({ dry: 1, reheat: 1 });
    expect(afterburnerCommand({}, 1, 0.385).dry).toBeCloseTo(0.5, 9);
    expect(afterburnerCommand({}, 1, 0.885).reheat).toBeCloseTo(0.5, 6);
  });

  test("full reheat is the F100's 1.63 times dry; strength 0 is a plain throttle, past 1 more reheat", () => {
    expect(afterburnerRatio({}, 1)).toBeCloseTo(1.627, 9);
    expect(afterburnerCommand({}, 0, 0.9)).toEqual({ dry: 0.9, reheat: 0 });
    expect(afterburnerRatio({}, 0)).toBe(1);
    expect(afterburnerRatio({}, 2)).toBeCloseTo(2.254, 9);
  });
});
