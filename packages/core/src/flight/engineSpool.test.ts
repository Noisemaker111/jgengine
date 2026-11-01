import { describe, expect, test } from "bun:test";

import { spoolRate, spoolThrust } from "./engineSpool";

function timeTo90(strength: number): number {
  let spool = 0;
  const h = 1 / 240;
  for (let i = 1; i < 240 * 60; i += 1) {
    spool += (1 - spool) * (1 - Math.exp(-spoolRate({}, strength, 1.5, 1 - spool) * h));
    if (spool >= 0.9) return i * h;
  }
  return Number.POSITIVE_INFINITY;
}

describe("engine spool", () => {
  test("idle to 90% of dry takes the F100's 3.9 s, slow at first and quick near the top", () => {
    expect(timeTo90(1)).toBeCloseTo(3.86, 1);
    expect(spoolRate({}, 1, 1.5, 1)).toBeCloseTo(0.1, 9);
    expect(spoolRate({}, 1, 1.5, 0.2)).toBeCloseTo(0.8, 9);
  });

  test("strength 0 is the simple first-order spool; past 1 every time constant stretches", () => {
    expect(spoolRate({}, 0, 1.5, 1)).toBe(1.5);
    expect(timeTo90(0)).toBeCloseTo(Math.log(10) / 1.5, 1);
    expect(timeTo90(2)).toBeCloseTo(2 * timeTo90(1), 1);
  });

  test("a running engine gives idle thrust at closed throttle", () => {
    expect(spoolThrust({}, 1, 0)).toBeCloseTo(0.085, 9);
    expect(spoolThrust({}, 0, 0)).toBe(0);
    expect(spoolThrust({}, 1, 1)).toBe(1);
  });
});
