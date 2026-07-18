import { describe, expect, test } from "bun:test";

import {
  advancePursuit,
  armPursuit,
  createPursuitState,
  type PursuitState,
} from "@jgengine/core/ai/pursuit";

describe("advancePursuit", () => {
  test("idle when there is no target", () => {
    const state = createPursuitState();
    expect(advancePursuit(state, 0.1, null, 2)).toBe("idle");
  });

  test("pursues while beyond stop distance, attacks once inside", () => {
    const state = createPursuitState();
    expect(advancePursuit(state, 0.1, 5, 2)).toBe("pursue");
    expect(advancePursuit(state, 0.1, 1.5, 2)).toBe("attack");
  });

  test("leash trips before anything else and only when home distance exceeds range", () => {
    const state = createPursuitState();
    // in range and ready, but led past the leash -> break off
    expect(advancePursuit(state, 0.1, 0.5, 2, "always", 20, 15)).toBe("leash");
    // within leash -> normal engagement
    expect(advancePursuit(state, 0.1, 0.5, 2, "always", 10, 15)).toBe("attack");
  });

  test("attack gates on the armed cooldown, then re-arms", () => {
    const state = createPursuitState();
    expect(advancePursuit(state, 0.1, 1, 2)).toBe("attack");
    armPursuit(state, 1);
    expect(advancePursuit(state, 0.4, 1, 2)).toBe("wait"); // 0.6 left
    expect(advancePursuit(state, 0.4, 1, 2)).toBe("wait"); // 0.2 left
    expect(advancePursuit(state, 0.4, 1, 2)).toBe("attack"); // hit 0
  });

  test('"always" ticks the cooldown during the chase; "inRange" freezes it', () => {
    const always: PursuitState = createPursuitState(1);
    // pursuing far away still burns the clock in "always" mode
    advancePursuit(always, 0.5, 9, 2, "always");
    expect(always.attackCooldown).toBeCloseTo(0.5, 5);

    const frozen: PursuitState = createPursuitState(1);
    advancePursuit(frozen, 0.5, 9, 2, "inRange");
    expect(frozen.attackCooldown).toBe(1); // unchanged during the chase
    advancePursuit(frozen, 0.5, 1, 2, "inRange"); // now in range -> ticks
    expect(frozen.attackCooldown).toBeCloseTo(0.5, 5);
  });

  test("armPursuit clamps negative intervals to zero and never drives cooldown below zero", () => {
    const state = createPursuitState(0.1);
    advancePursuit(state, 5, 1, 2); // large dt
    expect(state.attackCooldown).toBe(0);
    armPursuit(state, -3);
    expect(state.attackCooldown).toBe(0);
  });
});
