import { describe, expect, test } from "bun:test";
import { applyFeather, rampSpeed, type SpeedTuning } from "./speed";

const tuning: SpeedTuning = { base: 10, accel: 1, max: 14, boostMultiplier: 1.25, brakeMultiplier: 0.7 };

describe("speed ramp", () => {
  test("starts at base right after a respawn", () => {
    expect(rampSpeed(0, tuning)).toBe(10);
  });
  test("ramps linearly with elapsed time", () => {
    expect(rampSpeed(2, tuning)).toBe(12);
  });
  test("clamps at max", () => {
    expect(rampSpeed(100, tuning)).toBe(14);
  });
  test("negative elapsed never drops below base", () => {
    expect(rampSpeed(-5, tuning)).toBe(10);
  });
});

describe("boost/brake feather", () => {
  test("boost alone multiplies up", () => {
    expect(applyFeather(10, tuning, true, false)).toBe(12.5);
  });
  test("brake alone multiplies down", () => {
    expect(applyFeather(10, tuning, false, true)).toBe(7);
  });
  test("both held cancels out to the raw speed", () => {
    expect(applyFeather(10, tuning, true, true)).toBe(10);
  });
  test("neither held is a no-op", () => {
    expect(applyFeather(10, tuning, false, false)).toBe(10);
  });
});
