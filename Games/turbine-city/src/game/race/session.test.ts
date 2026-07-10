import { createRaceState, firstPastPost } from "@jgengine/core/game/race";
import { createRecordBook } from "@jgengine/core/game/recordBook";
import { describe, expect, test } from "bun:test";
import type { RawSteerInput } from "../flight/glider";
import { COUNTDOWN_SECONDS, createRaceSession, RECORD_FIELDS, type RaceSession } from "./session";
import { CHECKPOINTS, LAPS, LOOP_VIA_CONNECTOR, RING_NODES } from "./route";

const NEUTRAL_RAW: RawSteerInput = { pitchUp: false, pitchDown: false, yawLeft: false, yawRight: false, mouseX: 0, mouseY: 0 };

function tickThroughCountdown(session: RaceSession): void {
  for (let i = 0; i < COUNTDOWN_SECONDS * 10 + 1; i += 1) session.tick(0.1, NEUTRAL_RAW, false, false);
}

describe("ring sequence + lap logic (route data against the engine race state)", () => {
  test("visiting every ring in order completes a lap, two laps finishes the race", () => {
    const raceState = createRaceState({ track: { checkpoints: CHECKPOINTS, laps: LAPS }, win: firstPastPost(1) });
    raceState.addRacer("solo", 0);
    let now = 0;
    for (let lap = 0; lap < LAPS; lap += 1) {
      for (const node of RING_NODES) {
        now += 1;
        raceState.update(now, { solo: node.position });
      }
    }
    expect(raceState.finished).toBe(true);
    expect(raceState.ranking[0]).toBe("solo");
  });

  test("a racer that never reaches the next ring never advances", () => {
    const raceState = createRaceState({ track: { checkpoints: CHECKPOINTS, laps: LAPS }, win: firstPastPost(1) });
    raceState.addRacer("solo", 0);
    raceState.update(1, { solo: [10000, 0, 10000] });
    expect(raceState.progressOf("solo")?.nextCheckpoint).toBe(0);
  });
});

describe("RaceSession phase machine", () => {
  test("tick is a no-op before start()", () => {
    const session = createRaceSession();
    session.tick(1, NEUTRAL_RAW, true, false);
    expect(session.snapshot().phase).toBe("start");
    expect(session.snapshot().totalTime).toBe(0);
  });

  test("start() arms the countdown, and the countdown resolves into racing", () => {
    const session = createRaceSession();
    session.start();
    expect(session.snapshot().phase).toBe("countdown");
    expect(session.snapshot().countdown).toBeCloseTo(COUNTDOWN_SECONDS, 5);
    tickThroughCountdown(session);
    expect(session.snapshot().phase).toBe("racing");
  });

  test("the race clock and the player hold still during the countdown", () => {
    const session = createRaceSession();
    const spawn = session.snapshot().playerPose.position;
    session.start();
    for (let i = 0; i < 20; i += 1) session.tick(0.1, { ...NEUTRAL_RAW, mouseX: 1 }, true, false);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("countdown");
    expect(snapshot.totalTime).toBe(0);
    expect(snapshot.playerPose.position).toEqual(spawn);
  });
});

describe("RaceSession barrel-shift dodge", () => {
  function racingPair(): [RaceSession, RaceSession] {
    const a = createRaceSession();
    const b = createRaceSession();
    a.start();
    b.start();
    tickThroughCountdown(a);
    tickThroughCountdown(b);
    return [a, b];
  }

  test("a dodge displaces the glider laterally relative to an identical non-dodging run", () => {
    const [dodging, control] = racingPair();
    dodging.requestDodge();
    for (let i = 0; i < 6; i += 1) {
      dodging.tick(0.1, NEUTRAL_RAW, false, false);
      control.tick(0.1, NEUTRAL_RAW, false, false);
    }
    const moved = dodging.snapshot().playerPose.position;
    const still = control.snapshot().playerPose.position;
    const displacement = Math.hypot(moved[0] - still[0], moved[2] - still[2]);
    expect(displacement).toBeGreaterThan(4);
  });

  test("two charges spend down and the pips recharge over time", () => {
    const [session] = racingPair();
    expect(session.snapshot().dodge.charges).toBe(2);

    session.requestDodge();
    session.tick(0.1, NEUTRAL_RAW, false, false);
    expect(session.snapshot().dodge.charges).toBe(1);

    for (let i = 0; i < 5; i += 1) session.tick(0.1, NEUTRAL_RAW, false, false);
    session.requestDodge();
    session.tick(0.1, NEUTRAL_RAW, false, false);
    expect(session.snapshot().dodge.charges).toBe(0);

    for (let i = 0; i < 30; i += 1) session.tick(0.1, NEUTRAL_RAW, false, false);
    expect(session.snapshot().dodge.charges).toBeGreaterThanOrEqual(1);
  });

  test("a dodge inside the cooldown window is rejected", () => {
    const [session] = racingPair();
    session.requestDodge();
    session.tick(0.05, NEUTRAL_RAW, false, false);
    session.requestDodge();
    session.tick(0.05, NEUTRAL_RAW, false, false);
    expect(session.snapshot().dodge.charges).toBe(1);
  });
});

describe("RaceSession lose-by-timeout", () => {
  test("a session that never makes progress loses when the clock runs out", () => {
    const session = createRaceSession();
    session.start();
    for (let i = 0; i < 4000; i += 1) session.tick(0.1, NEUTRAL_RAW, false, false);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("finished");
    expect(snapshot.outcome).toBe("lose");
    expect(snapshot.records.bestTime).toBeNull();
  });
});

function angleDiff(target: number, current: number): number {
  const raw = target - current;
  return Math.atan2(Math.sin(raw), Math.cos(raw));
}

function flyAutopilot(session: RaceSession, maxTicks: number, dt: number): void {
  let waypointCursor = 1;
  for (let i = 0; i < maxTicks; i += 1) {
    const snapshot = session.snapshot();
    if (snapshot.phase === "finished") return;
    if (waypointCursor >= LOOP_VIA_CONNECTOR.length) waypointCursor = 0;
    const target = LOOP_VIA_CONNECTOR[waypointCursor]!.position;
    const dx = target[0] - snapshot.playerPose.position[0];
    const dz = target[2] - snapshot.playerPose.position[2];
    const dy = target[1] - snapshot.playerPose.position[1];
    const flat = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, dz);
    const desiredPitch = Math.atan2(dy, Math.max(1, flat));
    const yaw = Math.min(1, Math.max(-1, angleDiff(desiredHeading, snapshot.playerPose.heading) * 2.4));
    const pitch = Math.min(1, Math.max(-1, desiredPitch * 2.4));
    session.tick(dt, { pitchUp: false, pitchDown: false, yawLeft: false, yawRight: false, mouseX: yaw, mouseY: -pitch }, true, false);
    if (flat < 14) waypointCursor += 1;
  }
}

describe("RaceSession full flight — win/lose against the pacer", () => {
  test("an autopiloted player completes both laps and the race resolves with a verdict", () => {
    const session = createRaceSession();
    session.start();
    flyAutopilot(session, 3400, 0.1);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("finished");
    expect(snapshot.outcome === "win" || snapshot.outcome === "lose").toBe(true);
    expect(snapshot.laminar.percent).toBeGreaterThanOrEqual(0);
  });

  test("a finished run banks a personal best and a shadow ghost for the next race", () => {
    const book = createRecordBook({ key: "test", fields: RECORD_FIELDS });
    const session = createRaceSession(book);
    session.start();
    flyAutopilot(session, 3400, 0.1);
    const finished = session.snapshot();
    if (!finished.playerFinished) return;

    expect(finished.records.bestTime).not.toBeNull();
    expect(finished.records.improved).toContain("totalTime");
    expect(finished.ghost.bestTime).not.toBeNull();
    expect(book.bestOf("totalTime")).toBe(finished.records.bestTime);

    session.restart();
    expect(session.snapshot().ghost.pose).not.toBeNull();
    tickThroughCountdown(session);
    for (let i = 0; i < 30; i += 1) session.tick(0.1, NEUTRAL_RAW, true, false);
    const ghostPose = session.snapshot().ghost.pose;
    expect(ghostPose).not.toBeNull();
    expect(Number.isFinite(ghostPose!.position[0])).toBe(true);
  });
});

describe("RaceSession restart purity", () => {
  test("restart resets timing, laps, and streak back to a fresh session's values", () => {
    const fresh = createRaceSession();
    fresh.start();

    const session = createRaceSession();
    session.start();
    tickThroughCountdown(session);
    for (let i = 0; i < 50; i += 1) session.tick(0.1, { ...NEUTRAL_RAW, mouseX: 0.3 }, true, false);

    session.restart();
    const restarted = session.snapshot();
    const baseline = fresh.snapshot();

    expect(restarted.phase).toBe(baseline.phase);
    expect(restarted.lap).toBe(baseline.lap);
    expect(restarted.ringIndex).toBe(baseline.ringIndex);
    expect(restarted.laminar.streak).toBe(baseline.laminar.streak);
    expect(restarted.laminar.best).toBe(baseline.laminar.best);
    expect(restarted.playerPose.position).toEqual(baseline.playerPose.position);
    expect(restarted.outcome).toBe(baseline.outcome);
    expect(restarted.dodge.charges).toBe(baseline.dodge.charges);
  });

  test("restart clears a finished outcome so the session can race again", () => {
    const session = createRaceSession();
    session.start();
    for (let i = 0; i < 4000; i += 1) session.tick(0.1, NEUTRAL_RAW, false, false);
    expect(session.snapshot().phase).toBe("finished");

    session.restart();
    expect(session.snapshot().phase).toBe("countdown");
    expect(session.snapshot().outcome).toBeNull();
    expect(session.snapshot().totalTime).toBe(0);
    tickThroughCountdown(session);
    expect(session.snapshot().phase).toBe("racing");
  });
});
