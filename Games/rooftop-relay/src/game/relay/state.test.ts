import { describe, expect, test } from "bun:test";

import { applyFallPenalty, applyHandoff, currentLegSpec, INITIAL_RELAY_STATE, startRelay, tickRelayClock, TOTAL_LEGS } from "./state";
import { LEG_SPECS } from "../route/legs";
import { FALL_PENALTY_SECONDS, TIME_CAP_SECONDS } from "../tuning";

describe("relay state machine", () => {
  test("startRelay always yields the same fresh running state — restart is pure", () => {
    const first = startRelay();
    const second = startRelay();
    expect(first).toEqual(second);
    expect(first.phase).toBe("running");
    expect(first.legIndex).toBe(0);
    expect(first.elapsedSeconds).toBe(0);
    expect(first.splits).toEqual([]);
    expect(first.fallCount).toBe(0);
  });

  test("the relay clock only advances while running", () => {
    const menu = tickRelayClock(INITIAL_RELAY_STATE, 1, 5);
    expect(menu.elapsedSeconds).toBe(0);
    const running = tickRelayClock(startRelay(), 1, 5);
    expect(running.elapsedSeconds).toBeGreaterThan(0);
  });

  test("falling adds the fall penalty, counts the fall, and resets the baton", () => {
    const running = startRelay();
    const primed = { ...running, baton: { ...running.baton, paceStreakSeconds: 3, coldSeconds: 3 } };
    const fallen = applyFallPenalty(primed, "Zoe Chen");
    expect(fallen.elapsedSeconds).toBe(primed.elapsedSeconds + FALL_PENALTY_SECONDS);
    expect(fallen.legElapsedSeconds).toBe(primed.legElapsedSeconds + FALL_PENALTY_SECONDS);
    expect(fallen.fallCount).toBe(1);
    expect(fallen.baton.paceStreakSeconds).toBe(0);
    expect(fallen.baton.coldSeconds).toBe(0);
  });

  test("a clean handoff advances to the next leg with fresh baton state and records a split", () => {
    const running = startRelay();
    const next = applyHandoff(running, "clean", "Mika Torres");
    expect(next.legIndex).toBe(1);
    expect(next.legElapsedSeconds).toBe(0);
    expect(next.splits.length).toBe(1);
    expect(next.splits[0]!.legId).toBe(LEG_SPECS[0]!.id);
    expect(next.splits[0]!.quality).toBe("clean");
    expect(currentLegSpec(next).id).toBe(LEG_SPECS[1]!.id);
  });

  test("splits record time against that leg's par", () => {
    const running = { ...startRelay(), legElapsedSeconds: 20 };
    const next = applyHandoff(running, "neutral", "Mika Torres");
    expect(next.splits[0]!.parSeconds).toBe(LEG_SPECS[0]!.parSeconds);
    expect(next.splits[0]!.timeSeconds).toBe(20);
  });

  test("finishing the final leg under the time cap wins", () => {
    let state = startRelay();
    for (let i = 0; i < TOTAL_LEGS - 1; i += 1) state = applyHandoff(state, "clean", "next");
    expect(state.legIndex).toBe(TOTAL_LEGS - 1);
    const finished = applyHandoff({ ...state, elapsedSeconds: 10 }, "clean", null);
    expect(finished.phase).toBe("won");
    expect(finished.splits.length).toBe(TOTAL_LEGS);
  });

  test("finishing the final leg over the time cap loses", () => {
    let state = startRelay();
    for (let i = 0; i < TOTAL_LEGS - 1; i += 1) state = applyHandoff(state, "clean", "next");
    const finished = applyHandoff({ ...state, elapsedSeconds: TIME_CAP_SECONDS + 50 }, "neutral", null);
    expect(finished.phase).toBe("lost");
  });

  test("the relay clock ticking past the time cap mid-run loses", () => {
    const running = { ...startRelay(), elapsedSeconds: TIME_CAP_SECONDS - 0.5 };
    const ticked = tickRelayClock(running, 1, 5);
    expect(ticked.phase).toBe("lost");
  });
});
