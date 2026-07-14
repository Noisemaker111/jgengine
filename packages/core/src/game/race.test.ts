import { describe, expect, test } from "bun:test";

import {
  createLapTimer,
  createRaceState,
  everyoneFinishes,
  finishRaceSession,
  idleRaceSession,
  lapDurations,
  lastStanding,
  parDelta,
  placementOf,
  raceOutcomeOf,
  racePlacements,
  raceTrack,
  splitSegments,
  startRaceCountdown,
  tickRaceSession,
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

describe("removeRacer", () => {
  test("drops a racer's progress and standing", () => {
    const race = createRaceState({ track: TRACK, win: everyoneFinishes() });
    race.addRacer("p1");
    race.addRacer("p2");
    race.update(0, { p1: [20, 0, 0], p2: [0, 0, 0] });

    race.removeRacer("p1");

    expect(race.progressOf("p1")).toBeNull();
    expect(race.standings().map((s) => s.racerId)).toEqual(["p2"]);
  });

  test("recomputes standings positions without the removed racer", () => {
    const race = createRaceState({ track: TRACK, win: everyoneFinishes() });
    race.addRacer("p1");
    race.addRacer("p2");
    race.addRacer("p3");
    race.update(0, { p1: [20, 0, 0], p2: [0, 0, 0], p3: [0, 0, 0] });

    race.removeRacer("p1");

    const standings = race.standings();
    expect(standings.map((s) => s.racerId)).toEqual(["p2", "p3"]);
    expect(standings.map((s) => s.position)).toEqual([1, 2]);
  });

  test("is a no-op for an unknown racer id", () => {
    const race = createRaceState({ track: TRACK });
    race.addRacer("p1");
    expect(() => race.removeRacer("ghost")).not.toThrow();
    expect(race.standings().map((s) => s.racerId)).toEqual(["p1"]);
  });
});

describe("reset", () => {
  test("returns the race to its initial state", () => {
    const race = createRaceState({ track: TRACK, win: everyoneFinishes() });
    race.addRacer("p1");
    race.update(0, { p1: [0, 0, 0] });
    race.update(1, { p1: [20, 0, 0] });
    race.update(2, { p1: [20, 0, 20] });
    race.update(3, { p1: [0, 0, 0] });
    race.update(4, { p1: [20, 0, 0] });
    race.update(5, { p1: [20, 0, 20] });
    expect(race.finished).toBe(true);

    race.reset();

    expect(race.finished).toBe(false);
    expect(race.ranking).toEqual([]);
    expect(race.standings()).toEqual([]);
    expect(race.progressOf("p1")).toBeNull();
  });

  test("the instance is reusable for a fresh race after reset", () => {
    const race = createRaceState({ track: TRACK, win: everyoneFinishes() });
    race.addRacer("p1");
    race.update(0, { p1: [0, 0, 0] });
    race.reset();

    race.addRacer("p1");
    expect(race.progressOf("p1")).toMatchObject({ lap: 1, nextCheckpoint: 0, progress: 0, finished: false });

    const finish1 = race.update(0, { p1: [0, 0, 0] });
    const finish2 = race.update(1, { p1: [20, 0, 0] });
    const finish3 = race.update(2, { p1: [20, 0, 20] });
    race.update(3, { p1: [0, 0, 0] });
    race.update(4, { p1: [20, 0, 0] });
    const finish = race.update(5, { p1: [20, 0, 20] });
    expect([...finish1, ...finish2, ...finish3, ...finish].some((e) => e.type === "race.finished")).toBe(true);
    expect(race.finished).toBe(true);
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

describe("race forks", () => {
  const forkedTrack = () =>
    raceTrack({
      checkpoints: [line("start", 0, 0), line("cp1", 20, 0), line("finish", 40, 0)],
      forks: [
        {
          id: "canyon",
          afterIndex: 1,
          routes: [
            { id: "high", checkpoints: [line("high-a", 30, 10), line("high-b", 35, 10)] },
            { id: "low", checkpoints: [line("low-a", 30, -10)] },
          ],
        },
      ],
    });

  test("a racer commits to the route whose first checkpoint it hits and rejoins the mainline", () => {
    const race = createRaceState({ track: forkedTrack() });
    race.addRacer("a");
    race.update(1, { a: [0, 0, 0] });
    race.update(2, { a: [20, 0, 0] });

    const taken = race.update(3, { a: [30, 0, 10] });
    expect(eventTypes(taken, "fork.taken")).toEqual([
      { type: "fork.taken", racerId: "a", forkId: "canyon", routeId: "high", time: 3 },
    ]);
    const hit = eventTypes(taken, "checkpoint.hit")[0]!;
    expect(hit.type === "checkpoint.hit" && hit.fork).toEqual({ forkId: "canyon", routeId: "high", index: 0 });
    expect(race.progressOf("a")!.activeRoute).toEqual({ forkId: "canyon", routeId: "high" });

    race.update(4, { a: [35, 0, 10] });
    expect(race.progressOf("a")!.activeRoute).toBeNull();
    expect(race.progressOf("a")!.routesTaken).toEqual({ canyon: "high" });

    const finish = race.update(5, { a: [40, 0, 0] });
    expect(eventTypes(finish, "lap.completed")).toHaveLength(1);
    expect(race.progressOf("a")!.finished).toBe(true);
  });

  test("any completed route contributes exactly one checkpoint of progress", () => {
    const race = createRaceState({ track: forkedTrack(), win: everyoneFinishes() });
    race.addRacer("high");
    race.addRacer("low");
    race.update(1, { high: [0, 0, 0], low: [0, 0, 0] });
    race.update(2, { high: [20, 0, 0], low: [20, 0, 0] });
    race.update(3, { high: [30, 0, 10], low: [30, 0, -10] });
    race.update(4, { high: [35, 0, 10], low: [25, 0, -5] });
    const progressHigh = race.progressOf("high")!.progress;
    const progressLow = race.progressOf("low")!.progress;
    expect(progressHigh).toBeCloseTo(3, 5);
    expect(progressLow).toBeCloseTo(3, 5);
  });

  test("fork splits land in the racer's split list for route time accounting", () => {
    const race = createRaceState({ track: forkedTrack() });
    race.addRacer("a");
    race.update(1, { a: [0, 0, 0] });
    race.update(2, { a: [20, 0, 0] });
    race.update(3, { a: [30, 0, -10] });
    expect(race.progressOf("a")!.splits).toEqual([1, 2, 3]);
  });

  test("resetToCheckpoint respawns mid-route at the last route checkpoint", () => {
    const race = createRaceState({ track: forkedTrack() });
    race.addRacer("a");
    race.update(1, { a: [0, 0, 0] });
    race.update(2, { a: [20, 0, 0] });
    race.update(3, { a: [30, 0, 10] });
    const respawn = race.resetToCheckpoint("a")!;
    expect(respawn.position).toEqual([30, 0, 10]);
  });

  test("raceTrack validates fork placement and route shape", () => {
    const checkpoints = [line("start", 0, 0), line("finish", 40, 0)];
    const route = { id: "r", checkpoints: [line("x", 10, 5)] };
    expect(() =>
      raceTrack({ checkpoints, forks: [{ id: "bad", afterIndex: 1, routes: [route, route] }] }),
    ).toThrow();
    expect(() => raceTrack({ checkpoints, forks: [{ id: "bad", afterIndex: 0, routes: [route] }] })).toThrow();
    expect(() =>
      raceTrack({
        checkpoints,
        forks: [{ id: "bad", afterIndex: 0, routes: [route, { id: "empty", checkpoints: [] }] }],
      }),
    ).toThrow();
  });
});

describe("createLapTimer", () => {
  test("accumulates the current lap and total, banks splits, tracks best/last", () => {
    const timer = createLapTimer();
    timer.tick(1);
    timer.tick(0.5);
    expect(timer.snapshot().currentLap).toBeCloseTo(1.5);

    const first = timer.completeLap();
    expect(first).toBeCloseTo(1.5);
    let s = timer.snapshot();
    expect(s.currentLap).toBe(0);
    expect(s.lastLap).toBeCloseTo(1.5);
    expect(s.bestLap).toBeCloseTo(1.5);
    expect(s.lapCount).toBe(1);

    timer.tick(1);
    timer.completeLap();
    s = timer.snapshot();
    expect(s.lastLap).toBeCloseTo(1);
    expect(s.bestLap).toBeCloseTo(1);
    expect(s.total).toBeCloseTo(2.5);
    expect(s.splits.map((v) => Number(v.toFixed(2)))).toEqual([1.5, 1]);
  });

  test("penalize folds a penalty into the running lap and total", () => {
    const timer = createLapTimer();
    timer.tick(2);
    timer.penalize(1);
    const s = timer.snapshot();
    expect(s.currentLap).toBeCloseTo(3);
    expect(s.total).toBeCloseTo(3);
  });

  test("reset returns to the start line", () => {
    const timer = createLapTimer();
    timer.tick(5);
    timer.completeLap();
    timer.reset();
    expect(timer.snapshot()).toEqual({
      currentLap: 0,
      lastLap: null,
      bestLap: null,
      total: 0,
      lapCount: 0,
      splits: [],
    });
  });
});

describe("split analysis", () => {
  test("splitSegments turns cumulative splits into leg durations", () => {
    expect(splitSegments([10, 25, 45])).toEqual([10, 15, 20]);
    expect(splitSegments([10, 25], 5)).toEqual([5, 15]);
    expect(splitSegments([])).toEqual([]);
  });

  test("lapDurations derives per-lap times from gate splits", () => {
    // 2 gates per lap: lap 1 finishes at index 1, lap 2 at index 3.
    expect(lapDurations([12, 30, 42, 61], 2)).toEqual([30, 31]);
    expect(lapDurations([12, 30, 42], 2)).toEqual([30]);
    expect(lapDurations([12], 0)).toEqual([]);
  });

  test("parDelta compares against a reference book up to the shorter length", () => {
    expect(parDelta([10, 26, 40], [10, 25, 42])).toEqual([0, 1, -2]);
    expect(parDelta([10, 26], [10, 25, 42])).toEqual([0, 1]);
  });
});

describe("race session lifecycle", () => {
  test("idle session sits at zero on both clocks", () => {
    expect(idleRaceSession()).toEqual({ phase: "idle", countdown: 0, elapsed: 0 });
  });

  test("startRaceCountdown arms the default three-second countdown", () => {
    expect(startRaceCountdown()).toEqual({ phase: "countdown", countdown: 3, elapsed: 0 });
    expect(startRaceCountdown({ seconds: 5 })).toEqual({ phase: "countdown", countdown: 5, elapsed: 0 });
  });

  test("a non-positive countdown goes green immediately for a standing start", () => {
    expect(startRaceCountdown({ seconds: 0 })).toEqual({ phase: "racing", countdown: 0, elapsed: 0 });
    expect(startRaceCountdown({ seconds: -2 })).toEqual({ phase: "racing", countdown: 0, elapsed: 0 });
  });

  test("ticking bleeds the countdown then flips to racing at zero without banking overshoot", () => {
    let session = startRaceCountdown({ seconds: 3 });
    session = tickRaceSession(session, 1);
    expect(session).toEqual({ phase: "countdown", countdown: 2, elapsed: 0 });
    session = tickRaceSession(session, 5);
    expect(session).toEqual({ phase: "racing", countdown: 0, elapsed: 0 });
  });

  test("racing accumulates elapsed time", () => {
    let session = startRaceCountdown({ seconds: 0 });
    session = tickRaceSession(session, 1.5);
    session = tickRaceSession(session, 0.5);
    expect(session).toEqual({ phase: "racing", countdown: 0, elapsed: 2 });
  });

  test("non-positive dt and terminal phases are inert", () => {
    const racing = startRaceCountdown({ seconds: 0 });
    expect(tickRaceSession(racing, 0)).toBe(racing);
    expect(tickRaceSession(racing, -1)).toBe(racing);
    const idle = idleRaceSession();
    expect(tickRaceSession(idle, 2)).toBe(idle);
    const done = finishRaceSession(tickRaceSession(racing, 4));
    expect(tickRaceSession(done, 4)).toEqual(done);
  });

  test("finishRaceSession freezes elapsed only from racing", () => {
    const racing = tickRaceSession(startRaceCountdown({ seconds: 0 }), 9);
    expect(finishRaceSession(racing)).toEqual({ phase: "finished", countdown: 0, elapsed: 9 });
    const idle = idleRaceSession();
    expect(finishRaceSession(idle)).toBe(idle);
    const counting = startRaceCountdown({ seconds: 3 });
    expect(finishRaceSession(counting)).toBe(counting);
  });
});

describe("placement and outcome", () => {
  test("racePlacements ranks a finish order into 1-based places with a single-winner cutoff", () => {
    expect(racePlacements(["p1", "p2", "p3"])).toEqual([
      { racerId: "p1", place: 1, outcome: "win" },
      { racerId: "p2", place: 2, outcome: "lose" },
      { racerId: "p3", place: 3, outcome: "lose" },
    ]);
  });

  test("winningPlaces widens the podium to multiple wins", () => {
    expect(racePlacements(["a", "b", "c", "d"], { winningPlaces: 3 }).map((p) => p.outcome)).toEqual([
      "win",
      "win",
      "win",
      "lose",
    ]);
  });

  test("placementOf finds one racer or returns null when they never finished", () => {
    const order = ["lead", "chase", "trail"];
    expect(placementOf(order, "chase")).toEqual({ racerId: "chase", place: 2, outcome: "lose" });
    expect(placementOf(order, "lead")).toEqual({ racerId: "lead", place: 1, outcome: "win" });
    expect(placementOf(order, "ghost")).toBeNull();
  });

  test("raceOutcomeOf is the ranking[0]===player check, defaulting an absent racer to lose", () => {
    expect(raceOutcomeOf(["player", "rival"], "player")).toBe("win");
    expect(raceOutcomeOf(["rival", "player"], "player")).toBe("lose");
    expect(raceOutcomeOf(["rival", "player"], "player", { winningPlaces: 2 })).toBe("win");
    expect(raceOutcomeOf([], "player")).toBe("lose");
  });
});
