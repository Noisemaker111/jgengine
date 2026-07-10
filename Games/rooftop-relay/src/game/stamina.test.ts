import { describe, expect, test } from "bun:test";

import { isExhausted, stepStamina } from "./stamina";
import { STAMINA_JUMP_COST, STAMINA_MAX } from "./tuning";

describe("stamina", () => {
  test("drains while sprinting and moving", () => {
    const next = stepStamina({ current: STAMINA_MAX, max: STAMINA_MAX, sprinting: true, moving: true, jumped: false, dt: 1 });
    expect(next).toBeLessThan(STAMINA_MAX);
  });

  test("regenerates when not sprinting", () => {
    const next = stepStamina({ current: 10, max: STAMINA_MAX, sprinting: false, moving: true, jumped: false, dt: 1 });
    expect(next).toBeGreaterThan(10);
  });

  test("holding sprint while standing still does not drain (no movement)", () => {
    const next = stepStamina({ current: 50, max: STAMINA_MAX, sprinting: true, moving: false, jumped: false, dt: 1 });
    expect(next).toBeGreaterThan(50);
  });

  test("a jump spends a flat cost on top of any drain/regen", () => {
    const withJump = stepStamina({ current: STAMINA_MAX, max: STAMINA_MAX, sprinting: false, moving: false, jumped: true, dt: 0 });
    expect(withJump).toBe(STAMINA_MAX - STAMINA_JUMP_COST);
  });

  test("clamps to [0, max]", () => {
    const floor = stepStamina({ current: 1, max: STAMINA_MAX, sprinting: true, moving: true, jumped: true, dt: 5 });
    expect(floor).toBe(0);
    const ceiling = stepStamina({ current: STAMINA_MAX, max: STAMINA_MAX, sprinting: false, moving: false, jumped: false, dt: 5 });
    expect(ceiling).toBe(STAMINA_MAX);
  });

  test("isExhausted reports empty pools", () => {
    expect(isExhausted(0)).toBe(true);
    expect(isExhausted(0.1)).toBe(false);
  });
});
