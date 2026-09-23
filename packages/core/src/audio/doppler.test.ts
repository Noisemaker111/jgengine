import { describe, expect, test } from "bun:test";

import { dopplerRate, SPEED_OF_SOUND } from "./doppler";

const still = [0, 0, 0] as const;

describe("dopplerRate", () => {
  test("is 1 when nothing moves along the line of sight", () => {
    expect(dopplerRate(still, still, [10, 0, 0], still)).toBe(1);
    expect(dopplerRate(still, still, [10, 0, 0], [0, 0, 30])).toBeCloseTo(1, 9);
  });

  test("an approaching emitter pitches up and a receding one down", () => {
    const toward = dopplerRate(still, still, [100, 0, 0], [-34.3, 0, 0]);
    const away = dopplerRate(still, still, [100, 0, 0], [34.3, 0, 0]);
    expect(toward).toBeCloseTo(SPEED_OF_SOUND / (SPEED_OF_SOUND - 34.3), 9);
    expect(away).toBeCloseTo(SPEED_OF_SOUND / (SPEED_OF_SOUND + 34.3), 9);
  });

  test("a listener moving toward the emitter pitches up", () => {
    expect(dopplerRate(still, [34.3, 0, 0], [100, 0, 0], still)).toBeCloseTo(1.1, 9);
  });

  test("equal velocities cancel for a listener riding with the emitter", () => {
    const v = [60, 0, 0] as const;
    expect(dopplerRate([0, 0, 0], v, [-5, 0, 0], v)).toBeCloseTo(1, 9);
  });

  test("factor scales the shift and 0 turns it off", () => {
    const full = dopplerRate(still, still, [100, 0, 0], [-34.3, 0, 0]);
    const half = dopplerRate(still, still, [100, 0, 0], [-34.3, 0, 0], { factor: 0.5 });
    expect(half).toBeGreaterThan(1);
    expect(half).toBeLessThan(full);
    expect(dopplerRate(still, still, [100, 0, 0], [-34.3, 0, 0], { factor: 0 })).toBe(1);
  });

  test("clamps supersonic closing speeds into the range", () => {
    expect(dopplerRate(still, still, [100, 0, 0], [-1000, 0, 0])).toBe(2);
    expect(dopplerRate(still, still, [100, 0, 0], [1000, 0, 0], { range: [0.25, 4] })).toBeCloseTo(343 / 1343, 9);
  });
});
