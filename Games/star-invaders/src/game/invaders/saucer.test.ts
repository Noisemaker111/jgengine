import { describe, expect, test } from "bun:test";

import { SAUCER_TABLE, saucerScore } from "./saucer";

describe("saucer scoring", () => {
  test("every award lies in the classic 50-300 range", () => {
    for (let shots = 0; shots < 60; shots += 1) {
      const value = saucerScore(shots);
      expect(value).toBeGreaterThanOrEqual(50);
      expect(value).toBeLessThanOrEqual(300);
      expect([50, 100, 150, 300]).toContain(value);
    }
  });

  test("the award schedule repeats every fifteen shots", () => {
    for (let shots = 0; shots < 30; shots += 1) {
      expect(saucerScore(shots)).toBe(saucerScore(shots + SAUCER_TABLE.length));
    }
  });

  test("the jackpot 300 award is reachable", () => {
    const awards = Array.from({ length: SAUCER_TABLE.length }, (_, i) => saucerScore(i));
    expect(awards).toContain(300);
  });

  test("shot zero follows the table head", () => {
    expect(saucerScore(0)).toBe(SAUCER_TABLE[0]);
  });
});
