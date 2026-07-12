import { describe, expect, test } from "bun:test";

import { swingTimerState, type SwingPlayerInput, type SwingTargetInput } from "./swingTimer";

const mob: SwingTargetInput = { dead: false, kind: "enemy" };
const player = (autoAttack: boolean, swingTimer: number, speed = 2): SwingPlayerInput => ({
  autoAttack,
  swingTimer,
  weapon: { speed },
});

describe("swingTimerState", () => {
  test("hidden when not auto-attacking", () => {
    expect(swingTimerState(player(false, 1), mob, 0, 0).visible).toBe(false);
  });

  test("hidden with no target / dead / object target", () => {
    expect(swingTimerState(player(true, 1), null, 0, 0).visible).toBe(false);
    expect(swingTimerState(player(true, 1), { dead: true, kind: "enemy" }, 0, 0).visible).toBe(false);
    expect(swingTimerState(player(true, 1), { dead: false, kind: "object" }, 0, 0).visible).toBe(false);
  });

  test("recovers period on first show and fills toward 1", () => {
    const s = swingTimerState(player(true, 2, 2), mob, 0, 0);
    expect(s.visible).toBe(true);
    expect(s.nextPeriod).toBe(2);
    expect(s.frac).toBeCloseTo(0, 5);
    expect(s.ready).toBe(false);
  });

  test("mid-swing fill", () => {
    // period 2 carried; timer 0.5 → frac 0.75
    const s = swingTimerState(player(true, 0.5, 2), mob, 2, 2);
    expect(s.frac).toBeCloseTo(0.75, 5);
    expect(s.nextPeriod).toBe(2);
  });

  test("ready at zero", () => {
    const s = swingTimerState(player(true, 0, 2), mob, 2, 0.5);
    expect(s.ready).toBe(true);
    expect(s.labelKind).toBe("ready");
    expect(s.frac).toBeCloseTo(1, 5);
  });

  test("timer jump up recovers a fresh period (reset edge)", () => {
    // prev timer 0.1, now 1.8 (new swing) → period = max(1.8, speed)
    const s = swingTimerState(player(true, 1.8, 1.6), mob, 1.6, 0.1);
    expect(s.nextPeriod).toBe(1.8);
    expect(s.frac).toBeCloseTo(0, 5);
  });
});
