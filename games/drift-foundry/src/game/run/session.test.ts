import { describe, expect, test } from "bun:test";

import { steerToward } from "@jgengine/core/movement/steering";

import { EXIT_Z } from "./constants";
import { ROUTE_GATES } from "../route/gates";
import { PICKUPS } from "./pickups";
import { createRunSession, type RunSession } from "./session";
import { tuningFrom } from "../parts/build";
import { surfaceAt } from "../vehicle/surface";

const DT = 1 / 30;
const PAR_SECONDS = 100;

function shouldJump(session: RunSession): boolean {
  const snap = session.snapshot();
  const next = ROUTE_GATES.find(g => g.atZ >= snap.pose.position[2]);
  return next?.requirement === "jump" && !snap.pose.airborne && next.atZ - snap.pose.position[2] < Math.max(5, snap.pose.speedKmh / 3.6 * .5);
}

function driveStraight(session: RunSession, seconds: number): void {
  let elapsed = 0;
  while (elapsed < seconds) {
    if (session.snapshot().phase !== "running") return;
    session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: shouldJump(session), plowBracing: false });
    elapsed += DT;
  }
}

function steerTowardX(heading: number, dx: number): number {
  const desiredHeading = Math.max(-0.5, Math.min(0.5, dx * 0.03));
  return Math.max(-0.5, Math.min(0.5, steerToward(heading, desiredHeading) * 2));
}

function driveCollectingPickups(session: RunSession, seconds: number): void {
  let elapsed = 0;
  while (elapsed < seconds) {
    const snap = session.snapshot();
    if (snap.phase !== "running") return;
    const target = PICKUPS.find((p) => !snap.collectedIds.has(p.id) && p.position[2] > snap.pose.position[2] - 6);
    const targetX = target?.position[0] ?? 0;
    const steer = steerTowardX(snap.pose.heading, targetX - snap.pose.position[0]);
    session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: shouldJump(session), plowBracing: false, salvageSwap: true });
    elapsed += DT;
  }
}

describe("drift-foundry run session", () => {
  test("later EV decision reverses the earlier tradeoff: give up truck speed for steering", () => {
    const truck = createRunSession();
    const electric = createRunSession();
    for (const [session, takeElectric] of [[truck, false], [electric, true]] as const) {
      session.start();
      for (let i = 0; i < 3000 && session.snapshot().phase === "running" && session.snapshot().pose.position[2] < 190; i++) {
        session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: shouldJump(session), plowBracing: false, salvageSwap: session.snapshot().pose.position[2] < 70 || takeElectric });
      }
    }
    expect(truck.snapshot().installed.engine?.id).toBe("truck_engine");
    expect(electric.snapshot().installed.engine?.id).toBe("ev_conversion");
    expect(electric.snapshot().tuning.topSpeed).toBeLessThan(truck.snapshot().tuning.topSpeed);
    expect(electric.snapshot().tuning.turnRate).toBeGreaterThan(truck.snapshot().tuning.turnRate);
    // Midair swaps retain momentum. The speed cost becomes tangible after
    // braking for an obstacle, rather than inventing an instantaneous slowdown.
    for (const session of [truck, electric]) {
      for (let i=0;i<60;i++) session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
      for (let i=0;i<60;i++) session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    }
    expect(truck.snapshot().pose.speedKmh).toBeGreaterThan(electric.snapshot().pose.speedKmh);
  });
  test("passing keeps the engine; holding swap commits faster, less nimble truck", () => {
    const keep = createRunSession();
    const swap = createRunSession();
    for (const [session, consent] of [[keep, false], [swap, true]] as const) {
      session.start();
      for (let i = 0; i < 1500 && session.snapshot().pose.position[2] < 60; i++) session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false, salvageSwap: consent });
    }
    expect(keep.snapshot().installed.engine?.id).toBe("salvage_v6");
    expect(swap.snapshot().installed.engine?.id).toBe("truck_engine");
    expect(swap.snapshot().tuning.topSpeed).toBeGreaterThan(keep.snapshot().tuning.topSpeed);
    expect(swap.snapshot().tuning.turnRate).toBeLessThan(keep.snapshot().tuning.turnRate);
    expect(keep.snapshot().collectedIds.has("pickup_truck_engine")).toBe(false);
    expect(swap.snapshot().collectedIds.has("pickup_truck_engine")).toBe(true);
  });
  test("holding throttle without jumping stops at the tire stack and loses", () => {
    const session = createRunSession();
    session.start();
    for (let i = 0; i < 3000 && session.snapshot().phase === "running"; i++) {
      session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    }
    expect(session.snapshot().phase).toBe("crushed");
    expect(session.snapshot().pose.position[2]).toBeLessThanOrEqual(150);
    expect(session.snapshot().clearedGateIds.size).toBe(1);
  });
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

  test("the run reports a place in a four-kart field, and every rival raced the corridor", () => {
    const session = createRunSession();
    session.start();
    driveStraight(session, PAR_SECONDS);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("won");
    expect(snapshot.rivals).toHaveLength(3);
    expect(snapshot.race.total).toBe(4);
    expect(snapshot.race.place).toBeGreaterThanOrEqual(1);
    expect(snapshot.race.place).toBeLessThanOrEqual(4);
    expect(snapshot.outcome?.fieldSize).toBe(4);
    expect(snapshot.outcome?.place).toBe(snapshot.race.place);
    // Three karts that actually drove: they are down the corridor, not parked on the grid.
    expect(snapshot.rivals.every((rival) => rival.position[2] > 20)).toBe(true);
  });

  test("the same seed over the same drive produces the same race, place included", () => {
    const first = createRunSession();
    const second = createRunSession();
    for (const session of [first, second]) {
      session.start();
      driveStraight(session, 12);
    }
    expect(first.snapshot().rivals).toEqual(second.snapshot().rivals);
    expect(first.snapshot().race.standings).toEqual(second.snapshot().race.standings);
    expect(first.snapshot().race.place).toBe(second.snapshot().race.place);
    // The race is live, not a field of parked karts: somebody has changed place by now.
    expect(first.snapshot().rivals.some((rival) => rival.position[2] > 20)).toBe(true);
  });

  test("a centerline run with timed jumps collects the route parts and escapes", () => {
    const session = createRunSession();
    session.start();
    driveStraight(session, PAR_SECONDS);
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("won");
    expect(snapshot.outcome).not.toBeNull();
    expect(snapshot.outcome?.kind).toBe("won");
    expect(snapshot.outcome!.time).toBeLessThan(PAR_SECONDS);
    expect(snapshot.pose.position[2]).toBeGreaterThanOrEqual(EXIT_Z);
    // Reaching the exit is only possible because the run bolted on the plow and jump parts on the way —
    // the corridor is walled by barricades that a bare chassis cannot pass.
    expect(snapshot.tuning.hasPlow).toBe(true);
    expect(snapshot.tuning.jumpPower).toBeGreaterThan(0);
  });

  test("a kart that skips the plow/jump drops is walled in at the first barricade and gets crushed", () => {
    // Drive fast but steer hard to the corridor edge to dodge the centerline part drops. With no plow
    // and no jump the first barricade is an impassable wall, so the compactor eats the kart short of the exit.
    const session = createRunSession();
    session.start();
    let elapsed = 0;
    while (elapsed < PAR_SECONDS && session.snapshot().phase === "running") {
      session.tick(DT, { throttle: 1, brake: 0, steer: 1 }, { jumpPressed: false, plowBracing: false });
      elapsed += DT;
    }
    const snapshot = session.snapshot();
    expect(snapshot.tuning.hasPlow).toBe(false);
    expect(snapshot.tuning.jumpPower).toBe(0);
    expect(snapshot.phase).toBe("crushed");
    expect(snapshot.pose.position[2]).toBeLessThan(EXIT_Z);
  });

  test("hitting a barricade the build cannot clear bends the nose, costs top speed and pulls the wheel", () => {
    const session = createRunSession();
    session.start();
    const clean = session.snapshot();
    expect(clean.damage.every((zone) => zone.stage === 0)).toBe(true);
    // Full throttle down the centreline collects the plow but never jumps: the tire stack at z=150 stops it.
    for (let i = 0; i < 3000 && session.snapshot().phase === "running"; i++) {
      session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    }
    const bent = session.snapshot();
    expect(bent.damage.some((zone) => zone.stage > 0)).toBe(true);
    // The same build undamaged, for the numbers to mean something. A stage-1 nose of two is half of
    // the zone's 5% top-end cost.
    const parts = Object.values(bent.installed).filter((part) => part !== null);
    const undamaged = tuningFrom(parts);
    expect(bent.tuning.topSpeed).toBeLessThan(undamaged.topSpeed);
    expect(bent.tuning.topSpeed).toBeCloseTo(undamaged.topSpeed * 0.975, 5);
    expect(bent.ticker.some((line) => line.text.includes("FRONT END"))).toBe(true);
  });

  test("restart clears bent metal along with the build", () => {
    const session = createRunSession();
    session.start();
    for (let i = 0; i < 3000 && session.snapshot().phase === "running"; i++) {
      session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false });
    }
    expect(session.snapshot().damage.some((zone) => zone.stage > 0)).toBe(true);
    session.restart();
    const fresh = session.snapshot();
    expect(fresh.damage.every((zone) => zone.stage === 0)).toBe(true);
    expect(fresh.tuning.topSpeed).toBeCloseTo(tuningFrom([]).topSpeed, 6);
  });

  test("the yard under the kart is reported per zone, so different yards really grip differently", () => {
    const session = createRunSession();
    session.start();
    expect(session.snapshot().surface.zone.id).toBe("oil");
    driveStraight(session, 6);
    const later = session.snapshot();
    expect(later.zone.id).toBe("canyons");
    expect(later.surface.grip).toBeCloseTo(surfaceAt(later.pose.position[0], later.pose.position[2]).grip, 6);
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

  test("armor plating survives exactly one crusher clip, then a second clip crushes", () => {    const session = createRunSession();
    session.start();

    let armElapsed = 0;
    while (armElapsed < 300) {
      const snap = session.snapshot();
      if (snap.phase !== "running" || snap.armorSaveArmed) break;
      const target = PICKUPS.find((p) => !snap.collectedIds.has(p.id) && p.position[2] > snap.pose.position[2] - 6);
      const targetX = target?.position[0] ?? 0;
      const steer = steerTowardX(snap.pose.heading, targetX - snap.pose.position[0]);
      session.tick(DT, { throttle: 1, brake: 0, steer }, { jumpPressed: shouldJump(session), plowBracing: false, salvageSwap: true });
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

  test("an escape banks its line-scaled salvage and draws the next run's shift", () => {
    const session = createRunSession();
    session.start();
    driveStraight(session, PAR_SECONDS);
    const snapshot = session.snapshot();
    const outcome = snapshot.outcome!;
    expect(outcome.kind).toBe("won");
    expect(outcome.carried).toBeGreaterThan(0);
    expect(outcome.lineMultiplier).toBeGreaterThan(1);
    expect(outcome.banked).toBe(Math.round(outcome.carried * outcome.lineMultiplier));
    expect(outcome.banked).toBeGreaterThan(outcome.carried);
    expect(outcome.lost).toBe(0);
    expect(outcome.lineNotes.length).toBeGreaterThan(0);
    // The first escape on the salvage run also earns its first medals, paid on top of the line.
    expect(outcome.event.reward).toBeGreaterThan(0);
    expect(snapshot.career.credits).toBe(outcome.banked + outcome.event.reward);
    expect(snapshot.runsPlayed).toBe(1);
    expect(outcome.nextShift).not.toBeNull();
    expect(snapshot.salvageAtRisk).toBe(0);
  });

  test("a wreck loses the haul and keeps what an earlier escape banked", () => {
    const session = createRunSession();
    session.start();
    driveStraight(session, PAR_SECONDS);
    const banked = session.snapshot().career.credits;
    expect(banked).toBeGreaterThan(0);

    session.restart();
    driveCollectingPickups(session, 6);
    const carried = session.snapshot().salvageAtRisk;
    expect(carried).toBeGreaterThan(0);
    let elapsed = 0;
    while (elapsed < 120 && session.snapshot().phase === "running") {
      session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
      elapsed += DT;
    }
    const snapshot = session.snapshot();
    expect(snapshot.phase).toBe("crushed");
    // Coasting between the reading and the crush can sweep one more drop onto the kart.
    expect(snapshot.outcome?.carried).toBeGreaterThanOrEqual(carried);
    expect(snapshot.outcome?.banked).toBe(0);
    expect(snapshot.outcome?.lost).toBe(snapshot.outcome?.carried);
    expect(snapshot.outcome?.lineNotes).toEqual([]);
    expect(snapshot.career.credits).toBe(banked);
    expect(snapshot.runsPlayed).toBe(2);
    expect(snapshot.outcome?.nextShift).not.toBeNull();

    session.restart();
    expect(session.snapshot().salvageAtRisk).toBe(0);
    expect(session.snapshot().shift).not.toBeNull();
  });

  test("a career reloads with its run count and the shift it already drew", () => {
    const seed: Record<string, string> = {};
    const store = { getItem: (key: string) => seed[key] ?? null, setItem: (key: string, value: string) => { seed[key] = value; } };
    const first = createRunSession(undefined, store);
    first.start();
    driveStraight(first, PAR_SECONDS);
    const played = first.snapshot();
    expect(played.runsPlayed).toBe(1);

    const second = createRunSession(undefined, store);
    const reloaded = second.snapshot();
    expect(reloaded.runsPlayed).toBe(1);
    expect(reloaded.shift?.id).toBe(played.outcome?.nextShift?.id);
    expect(reloaded.career.credits).toBe(played.career.credits);
  });
});

test("a reload mid-run comes back carrying the salvage and the route", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const first = createRunSession(undefined, storage);
  first.start();
  driveCollectingPickups(first, 8);
  const before = first.snapshot();
  expect(before.salvageAtRisk).toBeGreaterThan(0);

  // The process dies here: a second session on the same storage is the reload.
  const second = createRunSession(undefined, storage);
  expect(values.get("drift-foundry.run.v1")).not.toBeNull();
  expect(values.get("drift-foundry.parked-run.v1")).not.toBeNull();
  second.start();
  const after = second.snapshot();
  expect(after.salvageAtRisk).toBe(before.salvageAtRisk);
  expect(Math.abs(after.runTime - before.runTime)).toBeLessThan(1);
  expect(Math.abs(after.pose.position[2] - before.pose.position[2])).toBeLessThan(5);
  expect(after.collectedIds).toEqual(before.collectedIds);
});
