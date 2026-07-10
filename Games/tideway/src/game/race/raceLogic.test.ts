import { describe, expect, test } from "bun:test";
import { GATES, LAPS } from "../course/track";
import {
  computePlacings,
  createTidewayRaceState,
  EMPTY_SURF_TALLY,
  lapTimesFromSplits,
  MAX_RACE_SEC,
  resolveOutcome,
  surfPercent,
  tallySurfTime,
} from "./raceLogic";

const PLAYER_ID = "player";
const RIVAL_A = "rival-a";
const RIVAL_B = "rival-b";

function driveThroughAllGates(
  raceState: ReturnType<typeof createTidewayRaceState>,
  racerId: string,
  laps: number,
  startTime: number,
) {
  let now = startTime;
  for (let lap = 0; lap < laps; lap += 1) {
    for (const gate of GATES) {
      now += 1;
      raceState.update(now, { [racerId]: gate.center });
    }
  }
  return now;
}

describe("race logic", () => {
  test("hitting every gate in order completes a lap and eventually the race", () => {
    const raceState = createTidewayRaceState();
    raceState.addRacer(PLAYER_ID, 0);

    let events: ReturnType<typeof raceState.update> = [];
    let now = 0;
    for (let lap = 0; lap < LAPS; lap += 1) {
      for (const gate of GATES) {
        now += 1;
        events = [...events, ...raceState.update(now, { [PLAYER_ID]: gate.center })];
      }
    }

    expect(events.some((event) => event.type === "lap.completed")).toBe(true);
    expect(events.some((event) => event.type === "race.finished")).toBe(true);
    expect(raceState.finished).toBe(true);
    expect(raceState.ranking[0]).toBe(PLAYER_ID);
  });

  test("gate sequence is order-sensitive: skipping ahead does not register", () => {
    const raceState = createTidewayRaceState();
    raceState.addRacer(PLAYER_ID, 0);
    raceState.update(1, { [PLAYER_ID]: GATES[3]!.center });
    expect(raceState.progressOf(PLAYER_ID)?.nextCheckpoint).toBe(0);
  });

  test("placings rank the first finisher ahead of racers still on course", () => {
    const raceState = createTidewayRaceState();
    raceState.addRacer(PLAYER_ID, 0);
    raceState.addRacer(RIVAL_A, 0);
    raceState.addRacer(RIVAL_B, 0);

    driveThroughAllGates(raceState, PLAYER_ID, LAPS, 0);
    raceState.update(500, { [RIVAL_A]: GATES[2]!.center, [RIVAL_B]: GATES[0]!.center });

    const placings = computePlacings(raceState);
    expect(placings[0]?.racerId).toBe(PLAYER_ID);
    expect(placings[0]?.finished).toBe(true);
    expect(placings.map((row) => row.racerId)).toContain(RIVAL_A);
    expect(placings.map((row) => row.racerId)).toContain(RIVAL_B);
  });

  test("win when the player finishes first", () => {
    const raceState = createTidewayRaceState();
    raceState.addRacer(PLAYER_ID, 0);
    raceState.addRacer(RIVAL_A, 0);
    const finishTime = driveThroughAllGates(raceState, PLAYER_ID, LAPS, 0);
    expect(resolveOutcome(raceState, PLAYER_ID, finishTime)).toBe("win");
  });

  test("lose when a rival finishes first", () => {
    const raceState = createTidewayRaceState();
    raceState.addRacer(RIVAL_A, 0);
    raceState.addRacer(PLAYER_ID, 0);
    const finishTime = driveThroughAllGates(raceState, RIVAL_A, LAPS, 0);
    expect(resolveOutcome(raceState, PLAYER_ID, finishTime)).toBe("lose");
  });

  test("lose on timeout while still racing", () => {
    const raceState = createTidewayRaceState();
    raceState.addRacer(PLAYER_ID, 0);
    expect(resolveOutcome(raceState, PLAYER_ID, MAX_RACE_SEC + 1)).toBe("lose");
  });

  test("still racing before the timeout with nobody finished", () => {
    const raceState = createTidewayRaceState();
    raceState.addRacer(PLAYER_ID, 0);
    expect(resolveOutcome(raceState, PLAYER_ID, MAX_RACE_SEC - 1)).toBe("racing");
  });

  test("reset() clears standings so the same instance replays cleanly", () => {
    const raceState = createTidewayRaceState();
    raceState.addRacer(PLAYER_ID, 0);
    driveThroughAllGates(raceState, PLAYER_ID, LAPS, 0);
    expect(raceState.finished).toBe(true);
    raceState.reset();
    expect(raceState.finished).toBe(false);
    expect(raceState.standings()).toEqual([]);
  });

  test("surf tally accumulates only while surfing and computes a clean percent", () => {
    let tally = EMPTY_SURF_TALLY;
    tally = tallySurfTime(tally, "surf", 2);
    tally = tallySurfTime(tally, "fight", 2);
    tally = tallySurfTime(tally, "neutral", 1);
    expect(tally.totalSec).toBe(5);
    expect(tally.surfSec).toBe(2);
    expect(surfPercent(tally)).toBeCloseTo(40, 5);
  });

  test("surf percent of an empty tally is zero, never NaN", () => {
    expect(surfPercent(EMPTY_SURF_TALLY)).toBe(0);
  });

  test("lapTimesFromSplits derives per-lap durations from cumulative splits", () => {
    const splits = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48];
    const laps = lapTimesFromSplits(splits, GATES.length);
    expect(laps.length).toBe(2);
    expect(laps[0]).toBeCloseTo(24, 5);
    expect(laps[1]).toBeCloseTo(24, 5);
  });

  test("lapTimesFromSplits returns nothing before a lap completes", () => {
    expect(lapTimesFromSplits([1, 2, 3], GATES.length)).toEqual([]);
  });
});
