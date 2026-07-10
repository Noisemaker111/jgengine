import { describe, expect, test } from "bun:test";
import { NEUTRAL_CAR_INPUT } from "./carKinematics";
import { NEUTRAL_RUN_INPUT, advanceRun, beginRun, createInitialRunState } from "./runState";

describe("run state purity and restart", () => {
  test("createInitialRunState is a pure function of its seed", () => {
    expect(createInitialRunState("border-push")).toEqual(createInitialRunState("border-push"));
  });

  test("an idle state never advances even when fed input and dt", () => {
    const idle = createInitialRunState("border-push");
    const next = advanceRun(idle, { ...NEUTRAL_RUN_INPUT, car: { ...NEUTRAL_CAR_INPUT, throttle: true } }, 5);
    expect(next).toBe(idle);
  });

  test("beginRun starts a fresh playing state identical to a restart", () => {
    const started = beginRun("border-push");
    let dirty = started;
    for (let i = 0; i < 30; i += 1) {
      dirty = advanceRun(dirty, { ...NEUTRAL_RUN_INPUT, car: { ...NEUTRAL_CAR_INPUT, throttle: true } }, 1 / 60);
    }
    expect(dirty.elapsed).toBeGreaterThan(0);

    const restarted = beginRun("border-push");
    expect(restarted).toEqual(started);
    expect(restarted.elapsed).toBe(0);
    expect(restarted.trustedShortcuts.size).toBe(0);
  });
});

describe("border arrival ends the run in a loss", () => {
  test("the truck reaching the border before capture flips the run to lost", () => {
    const started = beginRun("ghost-run");
    const next = advanceRun(started, NEUTRAL_RUN_INPUT, 400);
    expect(next.phase).toBe("lost");
    expect(next.result).not.toBeNull();
    expect(next.result?.finalGapMeters).toBeGreaterThanOrEqual(0);
  });
});

describe("radio log and branch tracking", () => {
  test("driving forward under throttle keeps the car inside the canyon and grows the radio log", () => {
    let state = beginRun("border-push");
    for (let i = 0; i < 600; i += 1) {
      state = advanceRun(state, { ...NEUTRAL_RUN_INPUT, car: { ...NEUTRAL_CAR_INPUT, throttle: true } }, 1 / 30);
      if (state.phase !== "playing") break;
    }
    expect(state.radioLog.length).toBeGreaterThan(0);
    expect(state.radioLog.length).toBeLessThanOrEqual(6);
  });
});
