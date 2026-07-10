import { describe, expect, test } from "bun:test";
import {
  applyDawnCheck,
  applyDetectionTick,
  attemptExit,
  beginGrab,
  elapsedSecondsFor,
  haulValueFor,
  initialHeistState,
  resolveGrabSuccess,
  restartHeist,
  setSneaking,
  startHeist,
  MAX_STRIKES,
} from "./heistState";
import { RUN_SECONDS } from "../schedule/mansionClock";
import { TREASURE_DEFS, SIDE_LOOT_DEFS } from "../items/treasures";

describe("heist state machine", () => {
  test("starts in intro with zero elapsed time regardless of clock", () => {
    const state = initialHeistState();
    expect(state.status).toBe("intro");
    expect(elapsedSecondsFor(state, 999)).toBe(0);
  });

  test("startHeist anchors runStartedAt to the current clock and begins play", () => {
    const started = startHeist(initialHeistState(), 50);
    expect(started.status).toBe("playing");
    expect(elapsedSecondsFor(started, 50)).toBe(0);
    expect(elapsedSecondsFor(started, 55)).toBe(5);
  });

  test("startHeist is a no-op once already playing", () => {
    const started = startHeist(initialHeistState(), 10);
    const startedAgain = startHeist(started, 999);
    expect(startedAgain).toBe(started);
  });

  test("three strikes end the run as caught, edge-triggered per detection window", () => {
    let state = startHeist(initialHeistState(), 0);
    const source = { kind: "guard" as const, name: "Test Guard", roomName: "Test Room" };

    state = applyDetectionTick(state, true, source, 1);
    expect(state.strikes).toBe(1);
    state = applyDetectionTick(state, true, source, 1.1);
    expect(state.strikes).toBe(1);

    state = applyDetectionTick(state, false, null, 2);
    state = applyDetectionTick(state, true, source, 3);
    expect(state.strikes).toBe(2);
    expect(state.status).toBe("playing");

    state = applyDetectionTick(state, false, null, 4);
    state = applyDetectionTick(state, true, source, 5);
    expect(state.strikes).toBe(MAX_STRIKES);
    expect(state.status).toBe("lost");
    expect(state.lostReason).toBe("caught");
    expect(state.caughtBy?.guardName).toBe("Test Guard");
  });

  test("dawn timeout ends the run as lost with reason dawn", () => {
    let state = startHeist(initialHeistState(), 0);
    state = applyDawnCheck(state, RUN_SECONDS - 1);
    expect(state.status).toBe("playing");
    state = applyDawnCheck(state, RUN_SECONDS + 1);
    expect(state.status).toBe("lost");
    expect(state.lostReason).toBe("dawn");
  });

  test("detection and dawn checks are no-ops once the run has ended", () => {
    let state = startHeist(initialHeistState(), 0);
    state = applyDawnCheck(state, RUN_SECONDS);
    const afterLoss = state;
    const source = { kind: "camera" as const, name: "Eye", roomName: "Room" };
    state = applyDetectionTick(state, true, source, RUN_SECONDS + 10);
    expect(state).toBe(afterLoss);
  });

  test("attemptExit refuses to win without all five treasures", () => {
    const state = startHeist(initialHeistState(), 0);
    const next = attemptExit(state, 10);
    expect(next.status).toBe("playing");
    expect(next.toasts.at(-1)?.text).toMatch(/empty-handed/);
  });

  test("attemptExit wins once all five treasures are collected and reports the haul", () => {
    let state = startHeist(initialHeistState(), 0);
    for (const treasure of TREASURE_DEFS) {
      state = resolveGrabSuccess(state, treasure.id, "treasure", treasure.name, 1);
    }
    const won = attemptExit(state, 200);
    expect(won.status).toBe("won");
    expect(won.wonSummary?.haulValue).toBe(haulValueFor(state));
    expect(won.wonSummary?.elapsedSeconds).toBe(200);
  });

  test("haul value sums collected treasures and side loot", () => {
    let state = startHeist(initialHeistState(), 0);
    state = resolveGrabSuccess(state, TREASURE_DEFS[0]!.id, "treasure", TREASURE_DEFS[0]!.name, 0);
    state = resolveGrabSuccess(state, SIDE_LOOT_DEFS[0]!.id, "loot", SIDE_LOOT_DEFS[0]!.name, 0);
    expect(haulValueFor(state)).toBe(TREASURE_DEFS[0]!.value + SIDE_LOOT_DEFS[0]!.value);
  });

  test("restart fully resets strikes, collected loot, sneaking, and grab state", () => {
    let state = startHeist(initialHeistState(), 0);
    state = setSneaking(state, true);
    state = beginGrab(state, TREASURE_DEFS[0]!.id, "treasure", 5);
    state = resolveGrabSuccess(state, TREASURE_DEFS[0]!.id, "treasure", TREASURE_DEFS[0]!.name, 6);
    state = applyDetectionTick(state, true, { kind: "guard", name: "G", roomName: "R" }, 7);

    const restarted = restartHeist(state, 100);
    expect(restarted.status).toBe("playing");
    expect(restarted.strikes).toBe(0);
    expect(restarted.collectedTreasureIds).toEqual([]);
    expect(restarted.collectedLootIds).toEqual([]);
    expect(restarted.sneaking).toBe(false);
    expect(restarted.activeGrab).toBeNull();
    expect(restarted.toasts).toEqual([]);
    expect(elapsedSecondsFor(restarted, 100)).toBe(0);
  });

  test("a second independent run does not see the first run's state (restart purity)", () => {
    const runA = restartHeist(startHeist(initialHeistState(), 0), 50);
    const runB = initialHeistState();
    expect(runB.strikes).toBe(0);
    expect(runB.status).toBe("intro");
    expect(runA).not.toBe(runB);
  });

  test("elapsedSecondsFor is deterministic — same state and now always agree", () => {
    const state = startHeist(initialHeistState(), 0);
    expect(elapsedSecondsFor(state, 123)).toBe(elapsedSecondsFor(state, 123));
  });
});
