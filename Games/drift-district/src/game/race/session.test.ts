import { describe, expect, test } from "bun:test";
import { createRaceState, raceTrack } from "@jgengine/core/game/race";
import { steerToward } from "@jgengine/core/movement/steering";

import { CHECKPOINTS, DRIFT_GATES, LAPS } from "./route";
import { createRaceSession } from "./session";
import { initialShiftState } from "./shift";

const DT = 1 / 30;

function driveTowardGate(session: ReturnType<typeof createRaceSession>, gateIndex: number, maxTicks: number): void {
  const target = DRIFT_GATES[gateIndex]!.position;
  for (let i = 0; i < maxTicks; i += 1) {
    const snap = session.snapshot();
    if (snap.phase !== "racing") {
      session.tick(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, false);
      continue;
    }
    if (snap.triggeredGates.length > 0) return;
    const pos = snap.playerPose.position;
    const dx = target[0] - pos[0];
    const dz = target[1] - pos[2];
    const desired = Math.atan2(dx, dz);
    const steer = Math.max(-1, Math.min(1, steerToward(snap.playerPose.heading, desired) * 2));
    session.tick(DT, { throttle: 1, brake: 0, steer, handbrake: 1 }, false);
  }
}

describe("race session — phases", () => {
  test("confirm starts the countdown, which resolves to racing", () => {
    const session = createRaceSession("phase-seed");
    expect(session.snapshot().phase).toBe("start");
    session.confirm();
    expect(session.snapshot().phase).toBe("countdown");
    for (let i = 0; i < 200 && session.snapshot().phase === "countdown"; i += 1) {
      session.tick(DT, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, false);
    }
    expect(session.snapshot().phase).toBe("racing");
  });

  test("the race timer accumulates while racing", () => {
    const session = createRaceSession("timer-seed");
    session.confirm();
    for (let i = 0; i < 200; i += 1) session.tick(DT, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, false);
    const before = session.snapshot().totalTime;
    for (let i = 0; i < 30; i += 1) session.tick(DT, { throttle: 1, brake: 0, steer: 0, handbrake: 0 }, false);
    expect(session.snapshot().totalTime).toBeGreaterThan(before);
  });
});

describe("race session — district shift", () => {
  test("clearing a drift gate under style opens the shortcut and matches the pure resolver", () => {
    const session = createRaceSession("integration-seed");
    session.confirm();
    for (let i = 0; i < 200 && session.snapshot().phase !== "racing"; i += 1) {
      session.tick(DT, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, false);
    }
    driveTowardGate(session, 0, 3000);
    const snap = session.snapshot();
    expect(snap.triggeredGates.length).toBeGreaterThan(0);
    const gate = DRIFT_GATES[0]!;
    expect(snap.shiftState[gate.targetShiftId]?.active).toBe(true);
    expect(snap.toast?.message).toBe("DISTRICT SHIFTED");
    expect(snap.styleScore).toBeGreaterThan(0);
  });
});

describe("race session — restart", () => {
  test("restart fully resets laps, timer, style score, and shift state", () => {
    const session = createRaceSession("restart-seed");
    session.confirm();
    for (let i = 0; i < 200 && session.snapshot().phase !== "racing"; i += 1) {
      session.tick(DT, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, false);
    }
    driveTowardGate(session, 0, 3000);
    const dirty = session.snapshot();
    expect(dirty.totalTime).toBeGreaterThan(0);
    expect(dirty.triggeredGates.length).toBeGreaterThan(0);

    session.restart();
    const fresh = session.snapshot();
    expect(fresh.phase).toBe("countdown");
    expect(fresh.lap).toBe(1);
    expect(fresh.currentLapTime).toBe(0);
    expect(fresh.totalTime).toBe(0);
    expect(fresh.bestLapTime).toBeNull();
    expect(fresh.lastLapTime).toBeNull();
    expect(fresh.styleScore).toBe(0);
    expect(fresh.outcome).toBeNull();
    expect(fresh.dnf).toBe(false);
    expect(fresh.toast).toBeNull();
    expect(fresh.triggeredGates).toEqual([]);
    expect(fresh.shiftState).toEqual(initialShiftState());
  });
});

describe("race session — DNF", () => {
  test("failing to clear a lap inside the timer cap ends the race as a loss", () => {
    const session = createRaceSession("dnf-seed");
    session.confirm();
    for (let i = 0; i < 200 && session.snapshot().phase !== "racing"; i += 1) {
      session.tick(DT, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, false);
    }
    for (let i = 0; i < 3000 && session.snapshot().phase === "racing"; i += 1) {
      session.tick(DT, { throttle: 0, brake: 0, steer: 0, handbrake: 0 }, false);
    }
    const snap = session.snapshot();
    expect(snap.phase).toBe("finished");
    expect(snap.dnf).toBe(true);
    expect(snap.outcome).toBe("lose");
  });
});

describe("race track — checkpoint order and lap/finish detection", () => {
  test("checkpoints must be hit in order; being inside a later checkpoint early does nothing", () => {
    const track = raceTrack({ checkpoints: CHECKPOINTS, laps: LAPS });
    const state = createRaceState({ track });
    state.addRacer("solo", 0);
    const farAhead = CHECKPOINTS[5]!.center;
    const events = state.update(1, { solo: farAhead });
    expect(events.filter((e) => e.type === "checkpoint.hit").length).toBe(0);
  });

  test("hitting every checkpoint in order completes a lap; completing all laps finishes the race", () => {
    const track = raceTrack({ checkpoints: CHECKPOINTS, laps: LAPS });
    const state = createRaceState({ track });
    state.addRacer("solo", 0);

    let now = 0;
    for (let lap = 0; lap < LAPS; lap += 1) {
      for (let i = 0; i < CHECKPOINTS.length; i += 1) {
        now += 1;
        const events = state.update(now, { solo: CHECKPOINTS[i]!.center });
        const hit = events.find((e) => e.type === "checkpoint.hit");
        expect(hit).toBeDefined();
        if (i === CHECKPOINTS.length - 1) {
          const lapEvent = events.find((e) => e.type === "lap.completed");
          expect(lapEvent).toBeDefined();
        }
      }
    }
    expect(state.finished).toBe(true);
    expect(state.ranking[0]).toBe("solo");
  });
});
