import { describe, expect, test } from "bun:test";

import { EXIT_Z } from "./constants";
import { PICKUPS } from "./pickups";
import { createRunSession, type RunSession } from "./session";

const DT = 1 / 30;
const PAR_SECONDS = 100;

function driveStraight(session: RunSession, seconds: number): void {
  let elapsed = 0;
  while (elapsed < seconds) {
    if (session.snapshot().phase !== "running") return;
    session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    elapsed += DT;
  }
}

function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function steerTowardX(heading: number, dx: number): number {
  const desiredHeading = Math.max(-0.5, Math.min(0.5, dx * 0.03));
  const headingError = normalizeAngle(desiredHeading - heading);
  return Math.max(-0.5, Math.min(0.5, headingError * 2));
}

function driveCollectingPickups(session: RunSession, seconds: number): void {
  let elapsed = 0;
  while (elapsed < seconds) {
    const snap = session.snapshot();
    if (snap.phase !== "running") return;
    const target = PICKUPS.find((p) => !snap.collectedIds.has(p.id) && p.position[2] > snap.pose.position[2] - 6);
    const targetX = target?.position[0] ?? 0;
    const steer = steerTowardX(snap.pose.heading, targetX - snap.pose.position[0]);
    session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: false, plowBracing: false });
    elapsed += DT;
  }
}

describe("wreckway run session", () => {
  test("does nothing while waiting on the start screen", () => {
    const session = createRunSession();
    session.tick(1, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("start");
    expect(snapshot.runTime).toBe(0);
  });

  test("start() enters running and queues the opening pit-radio line", () => {
    const session = createRunSession();
    session.start();
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("running");
    expect(snapshot.ticker[0]?.text).toBe("BOLT IT ON, GO GO");
  });

  test("baseline no-parts straight run through the mid lane reaches the exit before the compactor, under par", () => {
    const session = createRunSession();
    session.start();
    driveStraight(session, PAR_SECONDS);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("won");
    expect(snapshot.outcome).not.toBeNull();
    expect(snapshot.outcome?.kind).toBe("won");
    expect(snapshot.outcome!.time).toBeLessThan(PAR_SECONDS);
    expect(snapshot.pose.position[2]).toBeGreaterThanOrEqual(EXIT_Z);
  });

  test("an idle kart is caught and crushed by the compactor", () => {
    const session = createRunSession();
    session.start();
    let elapsed = 0;
    while (elapsed < 20 && session.snapshot().phase === "running") {
      session.tick(DT, { throttle: 0, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
      elapsed += DT;
    }
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("crushed");
    expect(snapshot.outcome?.kind).toBe("crushed");
    expect(snapshot.outcome?.zoneLabel).toBeTruthy();
  });

  test("restart fully resets state — no leftover progress, parts, or score", () => {
    const session = createRunSession();
    session.start();
    driveCollectingPickups(session, 6);
    const midRun = session.snapshot();
    expect(midRun.runTime).toBeGreaterThan(0);

    session.restart();
    const afterRestart = session.snapshot();
    expect(afterRestart.phase).toBe("running");
    expect(afterRestart.runTime).toBe(0);
    expect(afterRestart.pose.position[2]).toBeLessThan(10);
    expect(afterRestart.collectedIds.size).toBe(0);
    expect(Object.values(afterRestart.installed).every((part) => part === null)).toBe(true);
    expect(afterRestart.nearMissCount).toBe(0);
    expect(afterRestart.armorSavesUsed).toBe(0);
    expect(afterRestart.outcome).toBeNull();
    expect(afterRestart.ticker[0]?.text).toBe("BOLT IT ON, GO GO");
  });

  test("driving the full route collects most debris and swaps fill every slot", () => {
    const session = createRunSession();
    session.start();
    driveCollectingPickups(session, PAR_SECONDS);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("won");
    expect(snapshot.collectedIds.size).toBeGreaterThanOrEqual(8);
    expect(Object.values(snapshot.installed).filter((part) => part !== null).length).toBe(4);
    expect(snapshot.outcome?.partsOnExit).toBe(4);
  });

  test("armor plating survives exactly one crusher clip, then a second clip crushes", () => {
    const session = createRunSession();
    session.start();

    let armElapsed = 0;
    while (armElapsed < 300) {
      const snap = session.snapshot();
      if (snap.phase !== "running" || snap.armorSaveArmed) break;
      const target = PICKUPS.find((p) => !snap.collectedIds.has(p.id) && p.position[2] > snap.pose.position[2] - 6);
      const targetX = target?.position[0] ?? 0;
      const steer = steerTowardX(snap.pose.heading, targetX - snap.pose.position[0]);
      session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: false, plowBracing: false });
      armElapsed += DT;
    }
    const armed = session.snapshot();
    expect(armed.phase).toBe("running");
    expect(armed.armorSaveArmed).toBe(true);

    let idleElapsed = 0;
    while (idleElapsed < 120) {
      const snap = session.snapshot();
      if (snap.phase !== "running" || snap.armorSavesUsed > 0) break;
      session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
      idleElapsed += DT;
    }
    const afterFirstClip = session.snapshot();
    expect(afterFirstClip.phase).toBe("running");
    expect(afterFirstClip.armorSavesUsed).toBe(1);
    expect(afterFirstClip.armorSaveArmed).toBe(false);

    let idleElapsed2 = 0;
    while (idleElapsed2 < 120 && session.snapshot().phase === "running") {
      session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
      idleElapsed2 += DT;
    }
    expect(session.snapshot().phase).toBe("crushed");
  });
});
