import { describe, expect, test } from "bun:test";
import { PLANETOIDS } from "../cluster/catalog";
import type { KartPhysicsState } from "../physics/orbitalSim";
import { RIVALS, steerRival } from "../ai/rivals";
import { PLAYER_ID } from "../constants";
import { createRaceSession, type RaceSession, type RawKartInput } from "./session";

const DT = 1 / 30;
const NEUTRAL: RawKartInput = { thrust: false, retro: false, rotateLeft: false, rotateRight: false, dischargeHeld: false };

function autopilotInput(session: RaceSession): RawKartInput {
  const snap = session.snapshot();
  const kart = snap.karts[PLAYER_ID]!;
  const approxState: KartPhysicsState = {
    x: kart.position[0],
    z: kart.position[2],
    heading: kart.heading,
    vx: kart.velocity[0],
    vz: kart.velocity[1],
    wellCharge: kart.wellCharge,
    wellId: kart.wellId,
  };
  const steered = steerRival(approxState, RIVALS[0]!, kart.nextCheckpoint, PLANETOIDS);
  return {
    thrust: steered.thrust,
    retro: steered.retro,
    rotateLeft: steered.rotateLeft,
    rotateRight: steered.rotateRight,
    dischargeHeld: steered.discharge,
  };
}

describe("orbit-kart race session", () => {
  test("starts on the start screen with a full grid", () => {
    const session = createRaceSession();
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("start");
    expect(snapshot.lap).toBe(1);
    expect(snapshot.standings.length).toBe(3);
  });

  test("confirmStart begins the countdown, which resolves into racing", () => {
    const session = createRaceSession();
    session.confirmStart();
    expect(session.snapshot().phase).toBe("countdown");
    for (let i = 0; i < 200; i += 1) session.tick(DT, i * DT, NEUTRAL);
    expect(session.snapshot().phase).toBe("racing");
  });

  test("racing before countdown resolves does not move the kart", () => {
    const session = createRaceSession();
    session.confirmStart();
    const before = session.snapshot().karts[PLAYER_ID]!.position;
    session.tick(DT, 0, { thrust: true, retro: false, rotateLeft: false, rotateRight: false, dischargeHeld: false });
    const after = session.snapshot().karts[PLAYER_ID]!.position;
    expect(after).toEqual(before);
  });

  test("checkpoints capture in order, laps advance, and the race resolves win/lose with a podium", () => {
    const session = createRaceSession();
    session.confirmStart();
    let now = 0;
    let ticks = 0;
    const maxTicks = 760 * 30;
    while (session.snapshot().phase !== "finished" && ticks < maxTicks) {
      const input = session.snapshot().phase === "racing" ? autopilotInput(session) : NEUTRAL;
      session.tick(DT, now, input);
      now += DT;
      ticks += 1;
    }
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("finished");
    expect(snapshot.outcome === "win" || snapshot.outcome === "lose").toBe(true);
    expect(snapshot.lap).toBeGreaterThanOrEqual(2);
    expect(snapshot.standings.length).toBe(3);
  }, 20000);

  test("restart returns the session to a pristine countdown state", () => {
    const session = createRaceSession();
    session.confirmStart();
    for (let i = 0; i < 400; i += 1) {
      session.tick(DT, i * DT, { thrust: true, retro: false, rotateLeft: i % 5 === 0, rotateRight: false, dischargeHeld: i % 13 === 0 });
    }
    session.restart();

    const fresh = createRaceSession();
    fresh.confirmStart();

    const restarted = session.snapshot();
    const pristine = fresh.snapshot();
    expect(restarted.phase).toBe(pristine.phase);
    expect(restarted.lap).toBe(pristine.lap);
    expect(restarted.currentLapTime).toBe(pristine.currentLapTime);
    expect(restarted.totalTime).toBe(pristine.totalTime);
    expect(restarted.cleanSlingCount).toBe(pristine.cleanSlingCount);
    expect(restarted.bestLapTime).toBe(pristine.bestLapTime);
    expect(restarted.outcome).toBe(pristine.outcome);
    expect(restarted.karts).toEqual(pristine.karts);
    expect(restarted.standings).toEqual(pristine.standings);
  });
});
