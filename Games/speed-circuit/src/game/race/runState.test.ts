import { describe, expect, test } from "bun:test";
import type { RaceEvent } from "@jgengine/core/game/race";

import { applyRaceEvent, formatRaceTime, initialRunState, tickCountdown, tickRace } from "./runState";

describe("countdown phase", () => {
  test("ticks down and flips to racing at zero", () => {
    let state = initialRunState(3);
    state = tickCountdown(state, 1);
    expect(state.phase).toBe("countdown");
    expect(state.countdown).toBeCloseTo(2, 5);
    state = tickCountdown(state, 5);
    expect(state.phase).toBe("racing");
    expect(state.countdown).toBe(0);
  });
});

describe("tickRace", () => {
  test("accumulates current lap time and total time only while racing", () => {
    let state = initialRunState(3);
    state = { ...state, phase: "racing" };
    state = tickRace(state, 0.5, 40, false);
    state = tickRace(state, 0.5, 42, false);
    expect(state.currentLapTime).toBeCloseTo(1, 5);
    expect(state.totalTime).toBeCloseTo(1, 5);
    expect(state.speedKmh).toBe(42);
  });

  test("does not accumulate time outside the racing phase", () => {
    const state = tickRace(initialRunState(3), 1, 10, false);
    expect(state.currentLapTime).toBe(0);
    expect(state.speedKmh).toBe(10);
  });
});

describe("applyRaceEvent — lap timing", () => {
  test("lap.completed resets the current lap and records the best", () => {
    let state = { ...initialRunState(3), phase: "racing" as const };
    state = tickRace(state, 30, 0, false);
    const lapEvent: RaceEvent = { type: "lap.completed", racerId: "car", lap: 1, time: 30 };
    state = applyRaceEvent(state, lapEvent);
    expect(state.lap).toBe(2);
    expect(state.lastLapTime).toBeCloseTo(30, 5);
    expect(state.bestLapTime).toBeCloseTo(30, 5);
    expect(state.currentLapTime).toBe(0);
  });

  test("a slower second lap does not overwrite the best lap", () => {
    let state = { ...initialRunState(3), phase: "racing" as const };
    state = applyRaceEvent(tickRace(state, 25, 0, false), { type: "lap.completed", racerId: "car", lap: 1, time: 25 });
    state = applyRaceEvent(tickRace(state, 40, 0, false), { type: "lap.completed", racerId: "car", lap: 2, time: 40 });
    expect(state.bestLapTime).toBeCloseTo(25, 5);
    expect(state.lastLapTime).toBeCloseTo(40, 5);
  });

  test("a faster later lap replaces the best", () => {
    let state = { ...initialRunState(3), phase: "racing" as const };
    state = applyRaceEvent(tickRace(state, 40, 0, false), { type: "lap.completed", racerId: "car", lap: 1, time: 40 });
    state = applyRaceEvent(tickRace(state, 20, 0, false), { type: "lap.completed", racerId: "car", lap: 2, time: 20 });
    expect(state.bestLapTime).toBeCloseTo(20, 5);
  });

  test("race.finished flips the phase and stops further accumulation", () => {
    let state = { ...initialRunState(3), phase: "racing" as const };
    state = applyRaceEvent(state, { type: "race.finished", ranking: ["car"], time: 90 });
    expect(state.phase).toBe("finished");
    const after = tickRace(state, 5, 0, false);
    expect(after.currentLapTime).toBe(state.currentLapTime);
  });
});

describe("formatRaceTime", () => {
  test("formats sub-minute times with centiseconds", () => {
    expect(formatRaceTime(23.4)).toBe("0:23.40");
  });

  test("formats minute-scale times", () => {
    expect(formatRaceTime(83.456)).toBe("1:23.46");
  });

  test("clamps negative input to zero", () => {
    expect(formatRaceTime(-5)).toBe("0:00.00");
  });
});
