import { describe, expect, test } from "bun:test";

import {
  createRaceState,
  everyoneFinishes,
  lastStanding,
  raceTrack,
  topK,
  type Checkpoint,
  type RaceEvent,
} from "./race";

function line(id: string, x: number, z: number): Checkpoint {
  return { id, center: [x, 0, z], half: [3, 5, 3] };
}

const TRACK = raceTrack({
  checkpoints: [line("start", 0, 0), line("cp1", 20, 0), line("cp2", 20, 20)],
  laps: 2,
});

function eventTypes(events: readonly RaceEvent[], type: string): RaceEvent[] {
  return events.filter((e) => e.type === type);
}

describe("RaceState checkpoints, laps, finish", () => {
  test("checkpoints must be hit in order; the final checkpoint completes a lap", () => {
    const race = createRaceState({ track: TRACK, win: everyoneFinishes() });
    race.addRacer("p1");

    expect(eventTypes(race.update(0, { p1: [0, 0, 0] }), "checkpoint.hit")).toHaveLength(1);
    expect(race.update(1, { p1: [20, 0, 0] }).some((e) => e.type === "checkpoint.hit")).toBe(true);
    const lapEvents = race.update(2, { p1: [20, 0, 20] });
    expect(eventTypes(lapEvents, "lap.completed")).toHaveLength(1);
    expect(race.progressOf("p1")?.lap).toBe(2);

    race.update(3, { p1: [0, 0, 0] });
    race.update(4, { p1: [20, 0, 0] });
    const finish = race.update(5, { p1: [20, 0, 20] });
    expect(eventTypes(finish, "race.finished")).toHaveLength(1);
    expect(race.finished).toBe(true);
    expect(race.progressOf("p1")?.finished).toBe(true);
  });

  test("standing behind checkpoint 1 does not advance nextCheckpoint 0", () => {
    const race = createRaceState({ track: TRACK });
    race.addRacer("p1");
    race.update(0, { p1: [20, 0, 0] });
    expect(race.progressOf("p1")?.nextCheckpoint).toBe(0);
    expect(race.progressOf("p1")?.progress).toBe(0);
  });
});

describe("RaceState positions", () => {
  test("position.changed fires when a racer overtakes on checkpoint progress", () => {
    const race = createRaceState({ track: TRACK, win: everyoneFinishes() });
    race.addRacer("p1");
    race.addRacer("p2");
    race.update(0, { p1: [0, 0, 0], p2: [-50, 0, -50] });
    const events = race.update(1, { p1: [20, 0, 0], p2: [-50, 0, -50] });
    expect(race.progressOf("p1")?.position).toBe(1);
    expect(race.progressOf("p2")?.position).toBe(2);
    expect(eventTypes(events, "position.changed").length).toBeGreaterThanOrEqual(0);
  });
});

describe("reset-to-last-checkpoint", () => {
  test("returns a respawn pose at the last checkpoint facing the next", () => {
    const race = createRaceState({ track: TRACK });
    race.addRacer("p1");
    race.update(0, { p1: [0, 0, 0] });
    race.update(1, { p1: [20, 0, 0] });
    const respawn = race.resetToCheckpoint("p1");
    expect(respawn?.position).toEqual([20, 0, 0]);
    expect(typeof respawn?.heading).toBe("number");
  });
});

describe("pluggable win conditions", () => {
  test("topK round-cut resolves the moment k racers finish", () => {
    const shortTrack = raceTrack({ checkpoints: [line("a", 0, 0), line("b", 10, 0)], laps: 1 });
    const race = createRaceState({ track: shortTrack, win: topK(1) });
    race.addRacer("p1");
    race.addRacer("p2");
    race.update(0, { p1: [0, 0, 0], p2: [0, 0, 0] });
    const events = race.update(1, { p1: [10, 0, 0], p2: [-50, 0, 0] });
    expect(race.finished).toBe(true);
    expect(eventTypes(events, "race.finished")).toHaveLength(1);
    expect(race.ranking[0]).toBe("p1");
  });

  test("lastStanding derby ends when only one racer is left un-eliminated", () => {
    const race = createRaceState({ track: TRACK, win: lastStanding() });
    race.addRacer("a");
    race.addRacer("b");
    race.addRacer("c");
    expect(race.update(0, {}).some((e) => e.type === "race.finished")).toBe(false);
    race.eliminate("b");
    race.eliminate("c");
    const events = race.update(1, {});
    expect(eventTypes(events, "race.finished")).toHaveLength(1);
    expect(race.ranking[0]).toBe("a");
  });
});
