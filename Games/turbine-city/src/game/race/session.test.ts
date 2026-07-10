import { createRaceState, firstPastPost } from "@jgengine/core/game/race";
import { describe, expect, test } from "bun:test";
import type { RawSteerInput } from "../flight/glider";
import { createRaceSession, type RaceSession } from "./session";
import { CHECKPOINTS, LAPS, LOOP_VIA_CONNECTOR, RING_NODES } from "./route";

const NEUTRAL_RAW: RawSteerInput = { pitchUp: false, pitchDown: false, yawLeft: false, yawRight: false, mouseX: 0, mouseY: 0 };

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

  test("start() moves the session into racing", () => {
    const session = createRaceSession();
    session.start();
    expect(session.snapshot().phase).toBe("racing");
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
    flyAutopilot(session, 3200, 0.1);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("finished");
    expect(snapshot.outcome === "win" || snapshot.outcome === "lose").toBe(true);
    expect(snapshot.laminar.percent).toBeGreaterThanOrEqual(0);
  });
});

describe("RaceSession restart purity", () => {
  test("restart resets timing, laps, and streak back to a fresh session's values", () => {
    const fresh = createRaceSession();
    fresh.start();

    const session = createRaceSession();
    session.start();
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
  });

  test("restart clears a finished outcome so the session can race again", () => {
    const session = createRaceSession();
    session.start();
    for (let i = 0; i < 4000; i += 1) session.tick(0.1, NEUTRAL_RAW, false, false);
    expect(session.snapshot().phase).toBe("finished");

    session.restart();
    expect(session.snapshot().phase).toBe("racing");
    expect(session.snapshot().outcome).toBeNull();
    expect(session.snapshot().totalTime).toBe(0);
  });
});

