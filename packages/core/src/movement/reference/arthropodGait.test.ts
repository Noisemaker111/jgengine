import { describe, expect, test } from "bun:test";

import { ARTHROPOD_RUNNERS, arthropodStride, arthropodTopSpeed, compareArthropod, validateArthropodReference } from "./arthropodGait";

describe("arthropod gait", () => {
  test("every published arthropod check passes", () => {
    const rows = validateArthropodReference();
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((row) => !row.pass)).toEqual([]);
  });

  test("a cockroach runs a tripod below 1 m/s and leaves the ground above it", () => {
    expect(arthropodStride(ARTHROPOD_RUNNERS.cockroach, 0.8).gait).toBe("tripod");
    expect(arthropodStride(ARTHROPOD_RUNNERS.cockroach, 1.2).gait).toBe("running");
    expect(arthropodStride(ARTHROPOD_RUNNERS.tarantula, 0.2).gait).toBe("alternating tetrapod");
  });

  test("top speed scales with the square root of leg length", () => {
    const small = arthropodTopSpeed(6, 0.01);
    const large = arthropodTopSpeed(6, 0.04);
    expect(large.high / small.high).toBeCloseTo(2, 6);
    expect(arthropodTopSpeed(8, 0.04).high).toBeLessThan(small.low);
    expect(compareArthropod({ legs: 6, legLength: 0.03, walkSpeed: 0.5, runSpeed: 1.5 }).topSpeedRatio).toBeLessThan(1);
  });
});
