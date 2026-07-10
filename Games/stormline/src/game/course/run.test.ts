import { describe, expect, test } from "bun:test";
import type { RaceEvent } from "@jgengine/core/game/race";
import { FORKS } from "./catalog";
import {
  advanceRun,
  applyRaceEvents,
  initialRunState,
  laneGrip,
  MAX_SPEED,
  NEUTRAL_RUN_INPUT,
  startRun,
  STALL_SECONDS,
  type RunInput,
  type RunState,
} from "./run";
import { strikeCycle } from "./strikes";

function drive(state: RunState, input: Partial<RunInput>, dt: number, steps: number): RunState {
  const full: RunInput = { ...NEUTRAL_RUN_INPUT, ...input };
  let next = state;
  for (let i = 0; i < steps; i += 1) next = advanceRun(next, full, dt);
  return next;
}

describe("stormline vehicle + run reducer", () => {
  test("throttle accelerates the truck toward top speed on the clean lane", () => {
    const state = drive(startRun(), { throttle: true }, 1 / 30, 300);
    expect(state.speed).toBeGreaterThan(MAX_SPEED * 0.95);
    expect(state.progress).toBeGreaterThan(0);
  });

  test("steering deep into the storm lane reduces grip and top speed", () => {
    expect(laneGrip(0)).toBe(1);
    expect(laneGrip(-1)).toBeLessThan(1);
    expect(laneGrip(-1)).toBeGreaterThan(0);
  });

  test("holding no input coasts the truck to a stop", () => {
    const moving = drive(startRun(), { throttle: true }, 1 / 30, 60);
    const coasted = drive(moving, {}, 1 / 30, 300);
    expect(coasted.speed).toBe(0);
  });

  test("committing to the fast spur at a fork banks the shortcut bonus", () => {
    const fork = FORKS[0]!;
    let state = startRun();
    state = { ...state, progress: fork.forkProgress - 30, speed: 25 };
    state = drive(state, { throttle: true, steerLeft: true }, 1 / 30, 90);
    expect(state.forkChoices[fork.index]).toBe("fast");
    expect(state.bankedBonus).toBe(fork.bonusMeters);
  });

  test("staying on the safe spur banks no bonus", () => {
    const fork = FORKS[0]!;
    let state = startRun();
    state = { ...state, progress: fork.forkProgress - 30, speed: 25 };
    state = drive(state, { throttle: true }, 1 / 30, 90);
    expect(state.forkChoices[fork.index]).toBe("safe");
    expect(state.bankedBonus).toBe(0);
  });

  test("a fired lightning strike stalls the truck for the configured duration", () => {
    const fork = FORKS[0]!;
    const zone = fork.hazards[0]!;
    let activeAt = 0;
    for (let t = 0; t < 20; t += 0.02) {
      if (strikeCycle(zone, t * 1000).phase === "active") {
        activeAt = t;
        break;
      }
    }
    expect(activeAt).toBeGreaterThanOrEqual(0);

    const dt = 1 / 60;
    let state: RunState = {
      ...startRun(),
      now: activeAt - dt,
      progress: zone.progress,
      speed: 15,
      forkChoices: { [fork.index]: "fast" },
    };
    state = advanceRun(state, NEUTRAL_RUN_INPUT, dt);

    expect(state.struckZoneIds).toContain(zone.id);
    expect(state.stalledUntil).toBeCloseTo(activeAt + STALL_SECONDS, 5);

    let stalledState = state;
    for (let i = 0; i < 40; i += 1) stalledState = advanceRun(stalledState, { throttle: true }, 0.05);
    expect(stalledState.speed).toBe(0);
    expect(stalledState.now).toBeLessThan(state.stalledUntil);
  });

  test("a strike zone can only stall the truck once", () => {
    const fork = FORKS[0]!;
    const zone = fork.hazards[0]!;
    let activeAt = 0;
    for (let t = 0; t < 20; t += 0.02) {
      if (strikeCycle(zone, t * 1000).phase === "active") {
        activeAt = t;
        break;
      }
    }
    const dt = 1 / 60;
    let state: RunState = {
      ...startRun(),
      now: activeAt - dt,
      progress: zone.progress,
      speed: 0.01,
      forkChoices: { [fork.index]: "fast" },
    };
    state = advanceRun(state, NEUTRAL_RUN_INPUT, dt);
    expect(state.struckZoneIds.filter((id) => id === zone.id).length).toBe(1);
    state = advanceRun(state, NEUTRAL_RUN_INPUT, dt);
    expect(state.struckZoneIds.filter((id) => id === zone.id).length).toBe(1);
  });

  test("sustained deep exposure eventually loses the run", () => {
    let state: RunState = { ...startRun(), progress: -10_000 };
    for (let i = 0; i < 2000 && state.status === "playing"; i += 1) {
      state = advanceRun(state, NEUTRAL_RUN_INPUT, 0.1);
    }
    expect(state.status).toBe("lost");
    expect(state.loseGate).toBe(1);
    expect(state.log.at(-1)?.kind).toBe("lose");
  });

  test("advanceRun is a no-op once the run has ended", () => {
    const lost: RunState = { ...startRun(), status: "lost" };
    const next = advanceRun(lost, { throttle: true }, 1);
    expect(next).toBe(lost);
  });

  test("restart purity: startRun always returns a fresh, identical state", () => {
    const advanced = drive(startRun(), { throttle: true, steerLeft: true }, 1 / 30, 500);
    expect(advanced.progress).toBeGreaterThan(0);

    const restarted = startRun();
    const freshlyStarted = { ...initialRunState(), status: "playing" as const };
    expect(restarted).toEqual(freshlyStarted);
    expect(restarted.progress).toBe(0);
    expect(restarted.forkChoices).toEqual({});
    expect(restarted.log).toEqual([]);
  });

  test("applyRaceEvents advances gate splits and finishes the run on race.finished", () => {
    const playing = startRun();
    const checkpointEvent: RaceEvent = { type: "checkpoint.hit", racerId: "truck", checkpoint: 0, lap: 1, time: 12 };
    const afterGate = applyRaceEvents(playing, [checkpointEvent]);
    expect(afterGate.gatesPassed).toBe(1);
    expect(afterGate.gateSplits).toEqual([{ gate: 1, time: 12 }]);
    expect(afterGate.log.at(-1)?.kind).toBe("gate");

    const finishEvent: RaceEvent = { type: "race.finished", ranking: ["truck"], time: 200 };
    const won = applyRaceEvents(afterGate, [finishEvent]);
    expect(won.status).toBe("won");
    expect(won.finishedAt).toBe(200);
  });

  test("applyRaceEvents ignores a finish event once the run is already lost", () => {
    const lost: RunState = { ...startRun(), status: "lost" };
    const finishEvent: RaceEvent = { type: "race.finished", ranking: ["truck"], time: 50 };
    expect(applyRaceEvents(lost, [finishEvent])).toBe(lost);
  });
});
