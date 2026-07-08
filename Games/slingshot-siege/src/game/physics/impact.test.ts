import { describe, expect, test } from "bun:test";
import { DUMMY_BREAK_IMPULSE, MATERIALS, resolveBlockImpact, resolveDummyImpact } from "./impact";

describe("resolveBlockImpact", () => {
  test("wood breaks under a lighter impulse than stone", () => {
    const woodThreshold = MATERIALS.wood.breakImpulse;
    const stoneThreshold = MATERIALS.stone.breakImpulse;
    expect(woodThreshold).toBeLessThan(stoneThreshold);
    expect(resolveBlockImpact("wood", woodThreshold)).toBe(true);
    expect(resolveBlockImpact("wood", woodThreshold - 0.01)).toBe(false);
    expect(resolveBlockImpact("stone", woodThreshold)).toBe(false);
    expect(resolveBlockImpact("stone", stoneThreshold)).toBe(true);
  });

  test("a soft graze never breaks either material", () => {
    expect(resolveBlockImpact("wood", 0.1)).toBe(false);
    expect(resolveBlockImpact("stone", 0.1)).toBe(false);
  });
});

describe("resolveDummyImpact", () => {
  test("breaks at or above the threshold, survives below it", () => {
    expect(resolveDummyImpact(DUMMY_BREAK_IMPULSE)).toBe(true);
    expect(resolveDummyImpact(DUMMY_BREAK_IMPULSE + 5)).toBe(true);
    expect(resolveDummyImpact(DUMMY_BREAK_IMPULSE - 0.01)).toBe(false);
  });
});
