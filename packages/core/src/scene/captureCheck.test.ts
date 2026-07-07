import { describe, expect, test } from "bun:test";
import { captureChance, rollCapture } from "./captureCheck";

describe("captureChance", () => {
  test("is harder against a healthy target", () => {
    const healthy = captureChance({ hpFraction: 1, catchPower: 1 });
    const weakened = captureChance({ hpFraction: 0.1, catchPower: 1 });
    expect(weakened).toBeGreaterThan(healthy);
  });

  test("scales up with catch power", () => {
    const weak = captureChance({ hpFraction: 0.5, catchPower: 0.5 });
    const strong = captureChance({ hpFraction: 0.5, catchPower: 2 });
    expect(strong).toBeGreaterThan(weak);
  });

  test("scales down with difficulty", () => {
    const easy = captureChance({ hpFraction: 0.5, catchPower: 1, difficulty: 1 });
    const hard = captureChance({ hpFraction: 0.5, catchPower: 1, difficulty: 4 });
    expect(hard).toBeLessThan(easy);
  });

  test("clamps to [0, 1]", () => {
    expect(captureChance({ hpFraction: 0, catchPower: 100 })).toBe(1);
    expect(captureChance({ hpFraction: 1, catchPower: 0 })).toBe(0);
  });
});

describe("rollCapture", () => {
  test("succeeds when the roll is under the chance", () => {
    const input = { hpFraction: 0, catchPower: 1 };
    expect(rollCapture(input, () => 0.5)).toBe(true);
  });

  test("fails when the roll is over the chance", () => {
    const input = { hpFraction: 1, catchPower: 0.1 };
    expect(rollCapture(input, () => 0.9999)).toBe(false);
  });
});
