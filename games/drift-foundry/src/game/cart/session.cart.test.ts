import { describe, expect, test } from "bun:test";

import { CAREER_KEY, CART_VALUE_SHARE, ESCAPE_BONUS, newCareer, readCareer, SALVAGE_CREDITS, type CareerSave } from "../career";
import { createOpponentField, GUARD_DEF, RIVAL_DEFS } from "../race/opponents";
import { createRunSession, type RunSession } from "../run/session";
import { createCoursePilot, driveCourse, sessionTrack } from "../testing/courseDriver";
import { trackById } from "../tracks/catalog";
import { tuningFrom } from "../parts/build";
import { loadPart } from "./basket";
import type { PowerUpId } from "./goods";

const DT = 1 / 60;

function memory(seed?: (career: CareerSave) => void) {
  const map = new Map<string, string>();
  const career = newCareer();
  career.medals = { best: { "last-call": 1, "cart-stuffer": 200, "lights-out": 20, "grudge-brick": 9, "price-check": 20, "empty-cart": 20 } };
  seed?.(career);
  map.set(CAREER_KEY, JSON.stringify(career));
  return { map, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
}

function sessionOn(eventId: string, storage = memory()): RunSession {
  const session = createRunSession(() => 0, storage);
  expect(session.selectEvent(eventId)).toEqual({ ok: true });
  session.start();
  return session;
}

/** Shop and sweep down the department until the oldest power-up in the child seat is `id`, using any other one on the way. */
function driveUntilHolding(session: RunSession, id: PowerUpId, limit = 90): boolean {
  const pilot = createCoursePilot(sessionTrack(session), { shop: true, sweep: true });
  for (let t = 0; t < limit; t += DT) {
    const snap = session.snapshot();
    if (snap.phase !== "running") return false;
    if (snap.basket.powerUps[0]?.id === id) return true;
    const frame = pilot(snap);
    session.tick(DT, frame.axis, { ...frame.input, usePower: snap.basket.powerUps.length > 0 && snap.basket.powerUps[0]!.id !== id });
  }
  return false;
}

/** The events a power-up hunt tries, in order: the first whose department hands it over is used. */
const HUNT = ["price-check", "grudge-brick", "cart-stuffer", "empty-cart", "lights-out", "last-call"] as const;

/** Two identical runs brought to the same moment: deterministic sims let one use a power-up and the other not. */
function twins(id: PowerUpId): [RunSession, RunSession] {
  const eventId = HUNT.find((event) => driveUntilHolding(sessionOn(event), id));
  expect(eventId).toBeDefined();
  const a = sessionOn(eventId!);
  const b = sessionOn(eventId!);
  expect(driveUntilHolding(a, id)).toBe(true);
  expect(driveUntilHolding(b, id)).toBe(true);
  expect(a.snapshot().runTime).toBeCloseTo(b.snapshot().runTime, 6);
  return [a, b];
}

describe("shopping in a run", () => {
  test("steering into the shelves fills the basket, and the cart handles like what is in it", () => {
    const session = sessionOn("last-call");
    driveCourse(session, { shop: true, sweep: true, limit: 25 });
    const snap = session.snapshot();
    expect(snap.shelvesTaken.size).toBeGreaterThanOrEqual(2);
    expect(snap.basket.goods.length).toBeGreaterThan(0);
    expect(snap.basket.value).toBeGreaterThan(0);
    const parts = Object.values(snap.installed).filter((part) => part !== null);
    const loaded = tuningFrom(parts, undefined, { load: loadPart({ goods: snap.basket.goods, powerUps: snap.basket.powerUps }) });
    expect(snap.tuning.accel).toBeCloseTo(loaded.accel, 6);
    expect(snap.tuning.accel).not.toBeCloseTo(tuningFrom(parts).accel, 3);
  });

  test("the self-checkout prints a receipt and pays a share of the cart in store credit", () => {
    const shopped = sessionOn("last-call");
    driveCourse(shopped, { shop: true, sweep: true });
    const snap = shopped.snapshot();
    expect(snap.phase).toBe("won");
    const outcome = snap.outcome!;
    expect(outcome.cartValue).toBeGreaterThan(0);
    expect(outcome.receipt).not.toBeNull();
    expect(outcome.receipt!.lines.some((line) => line.label.startsWith("CART"))).toBe(true);
    expect(outcome.receipt!.total).toBe(outcome.receipt!.lines.reduce((sum, line) => sum + line.points, 0));
    expect(outcome.carried).toBe(snap.collectedIds.size * SALVAGE_CREDITS + ESCAPE_BONUS + Math.round(outcome.cartValue * CART_VALUE_SHARE));
    expect(snap.bestReceipt).toBe(outcome.receipt!.total);
  });

  test("a cart the shutters catch gets no receipt", () => {
    const session = sessionOn("shutter-rush");
    driveCourse(session, { stall: 6 });
    expect(session.snapshot().phase).toBe("crushed");
    expect(session.snapshot().outcome?.receipt).toBeNull();
  });

  test("Cart Stuffer medals on the dollars in the basket at the tills", () => {
    const session = sessionOn("cart-stuffer");
    driveCourse(session, { shop: true, sweep: true });
    const snap = session.snapshot();
    expect(snap.phase).toBe("won");
    expect(snap.outcome?.event.result).toBe(`$${Math.round(snap.outcome!.cartValue)} in the cart`);
    expect(snap.outcome?.event.medal).toBe("gold");
  });
});

describe("power-ups", () => {
  test("the fire extinguisher boosts the cart past what the same cart reaches without it", () => {
    const [boosted, plain] = twins("extinguisher");
    const pilotA = createCoursePilot(sessionTrack(boosted), {});
    const pilotB = createCoursePilot(sessionTrack(plain), {});
    let first = true;
    for (let t = 0; t < 1.5; t += DT) {
      const a = pilotA(boosted.snapshot());
      boosted.tick(DT, { ...a.axis, throttle: 1, brake: 0 }, { ...a.input, usePower: first });
      const b = pilotB(plain.snapshot());
      plain.tick(DT, { ...b.axis, throttle: 1, brake: 0 }, b.input);
      first = false;
    }
    expect(boosted.snapshot().boostLeft).toBeGreaterThan(0);
    expect(boosted.snapshot().run).toBeGreaterThan(plain.snapshot().run + 1);
    expect(boosted.snapshot().ticker.some((line) => line.text.includes("WHOOSH"))).toBe(true);
  });

  test("a stack of bouncy balls throws the cart higher than the pogo casters' own hop", () => {
    const [bounced, hopped] = twins("bouncy_balls");
    let bouncedAir = 0;
    let hoppedAir = 0;
    for (let t = 0; t < 2.5; t += DT) {
      bounced.tick(DT, { throttle: 0.4, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false, usePower: t === 0 });
      hopped.tick(DT, { throttle: 0.4, brake: 0, steer: 0 }, { jumpPressed: t === 0, plowBracing: false });
      if (bounced.snapshot().pose.airborne) bouncedAir += DT;
      if (hopped.snapshot().pose.airborne) hoppedAir += DT;
    }
    expect(hopped.snapshot().tuning.jumpPower).toBeGreaterThan(0);
    expect(bouncedAir).toBeGreaterThan(hoppedAir + 0.15);
  });

  test("marbles spill behind the cart and the shutters sweep them up", () => {
    const event = HUNT.find((entry) => driveUntilHolding(sessionOn(entry), "marbles"))!;
    const session = sessionOn(event);
    expect(driveUntilHolding(session, "marbles")).toBe(true);
    const before = session.snapshot();
    session.tick(DT, { throttle: 1, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false, usePower: true });
    const spilled = session.snapshot();
    expect(spilled.marbles).toHaveLength(1);
    expect(spilled.basket.powerUps.length).toBe(before.basket.powerUps.length - 1);
    const track = trackById(spilled.track.id)!;
    const spill = spilled.marbles[0]!;
    const spillRun = track.run(track.locate(spill.position[0], spill.position[2]));
    expect(spillRun).toBeLessThan(spilled.run);
    // Drive on: the spill stays on the floor until the shutters roll over it, then it is swept up.
    const pilot = createCoursePilot(track, {});
    for (let t = 0; t < 120 && session.snapshot().compactorZ <= spillRun + 1 && session.snapshot().phase === "running"; t += DT) {
      if (session.snapshot().compactorZ < spillRun - 1) expect(session.snapshot().marbles).toHaveLength(1);
      const frame = pilot(session.snapshot());
      session.tick(DT, frame.axis, frame.input);
    }
    expect(session.snapshot().compactorZ).toBeGreaterThan(spillRun);
    expect(session.snapshot().marbles).toHaveLength(0);
  });

  test("the rotisserie chicken heals a bent cart", () => {
    const event = HUNT.find((entry) => driveUntilHolding(sessionOn(entry), "rotisserie_chicken"))!;
    const session = sessionOn(event);
    expect(driveUntilHolding(session, "rotisserie_chicken")).toBe(true);
    // Drive on without hopping, so the next pallet ramp bends the basket and there is something to heal.
    const pilot = createCoursePilot(sessionTrack(session), {});
    for (let t = 0; t < 60 && session.snapshot().phase === "running" && session.snapshot().damage.every((zone) => zone.stage === 0); t += DT) {
      const frame = pilot(session.snapshot());
      session.tick(DT, frame.axis, { ...frame.input, jumpPressed: false });
    }
    expect(session.snapshot().damage.some((zone) => zone.stage > 0)).toBe(true);
    session.tick(DT, { throttle: 0, brake: 0, steer: 0 }, { jumpPressed: false, plowBracing: false, usePower: true });
    const healed = session.snapshot();
    expect(healed.damage.every((zone) => zone.stage === 0)).toBe(true);
    expect(healed.lastGrab?.label).toContain("CHICKEN");
  });
});

describe("the field", () => {
  test("a stunned rival spins out and falls behind the same rival left alone", () => {
    const track = trackById("aisle-nine")!;
    const make = () => createOpponentField({ track, defs: [RIVAL_DEFS[2]!] });
    const spun = make();
    const clean = make();
    for (let t = 0; t < 3; t += DT) {
      spun.tick(DT, [0, 0, -200], -200, t);
      clean.tick(DT, [0, 0, -200], -200, t);
    }
    expect(spun.stun("rival_brick", 1.6)).toBe(true);
    expect(spun.bodies()[0]!.stunned).toBe(true);
    for (let t = 3; t < 5; t += DT) {
      spun.tick(DT, [0, 0, -200], -200, t);
      clean.tick(DT, [0, 0, -200], -200, t);
    }
    expect(spun.bodies()[0]!.stunned).toBe(false);
    expect(spun.bodies()[0]!.run).toBeLessThan(clean.bodies()[0]!.run - 3);
  });

  test("Officer Dale patrols Lights Out and Closing Time without racing, and cuts across to block the cart behind him", () => {
    const lights = sessionOn("lights-out");
    expect(lights.snapshot().rivals.map((rival) => rival.id)).toContain("rival_guard");
    expect(lights.snapshot().race.total).toBe(4);
    expect(lights.snapshot().race.standings.some((entry) => entry.id === "rival_guard")).toBe(false);
    expect(sessionOn("last-call").snapshot().rivals.some((rival) => rival.id === "rival_guard")).toBe(false);

    const track = trackById("aisle-nine")!;
    let tackles = 0;
    const field = createOpponentField({ track, defs: [GUARD_DEF], onGuardTackle: () => { tackles += 1; } });
    // The player holds the far-left lane 12 m behind the guard: he swings over to meet them.
    for (let t = 0; t < 2.5; t += DT) field.tick(DT, [9, 0, GUARD_DEF.grid.z - 12], GUARD_DEF.grid.z - 12, t);
    expect(field.bodies()[0]!.position[0]).toBeGreaterThan(3);
    // And contact is a tackle, once per cooldown.
    for (let t = 2.5; t < 4; t += DT) field.tick(DT, field.bodies()[0]!.position, field.bodies()[0]!.run, t);
    expect(tackles).toBe(1);
  });
});

describe("rivals with personality", () => {
  test("overtaking a shopper gets a word from them on the PA", () => {
    const session = sessionOn("last-call");
    const heard = new Set<string>();
    const pilot = createCoursePilot(sessionTrack(session), { sweep: true });
    for (let t = 0; t < 120 && session.snapshot().phase === "running"; t += DT) {
      const frame = pilot(session.snapshot());
      session.tick(DT, frame.axis, frame.input);
      for (const line of session.snapshot().ticker) heard.add(line.text);
    }
    const quips = RIVAL_DEFS.flatMap((def) => (def.quips === undefined ? [] : [def.quips.passed, def.quips.passes]));
    expect([...heard].some((line) => quips.includes(line))).toBe(true);
  });
});

describe("the cart corral", () => {
  test("store credit unlocks a cart, the next run pushes it, and the choice survives a reload", () => {
    const storage = memory((career) => { career.bank.banked = 600; });
    const session = createRunSession(() => 0, storage);
    expect(session.snapshot().chassis.id).toBe("standard");
    expect(session.chooseChassis("scooter")).toMatchObject({ ok: false });
    expect(session.chooseChassis("kiddie")).toEqual({ ok: true });
    const snap = session.snapshot();
    expect(snap.chassis.id).toBe("kiddie");
    expect(snap.basket.capacity).toBe(4);
    expect(snap.career.credits).toBe(50);
    expect(snap.corral.find((row) => row.chassis.id === "kiddie")).toMatchObject({ owned: true, selected: true });
    expect(readCareer(storage).carts).toEqual({ owned: ["standard", "kiddie"], selected: "kiddie" });
    expect(session.chooseChassis("standard")).toEqual({ ok: true });
    expect(session.snapshot().career.credits).toBe(50);
    session.start();
    expect(session.chooseChassis("kiddie")).toMatchObject({ ok: false });
  });

  test("a parked cart keeps its shopping", () => {
    const storage = memory();
    const session = sessionOn("last-call", storage);
    driveCourse(session, { shop: true, sweep: true, limit: 20 });
    for (let i = 0; i < 400 && session.snapshot().pose.speedKmh > 0.05; i += 1) session.tick(DT, { throttle: 0, brake: 1, steer: 0 }, { jumpPressed: false, plowBracing: false });
    const parked = session.snapshot();
    expect(parked.basket.goods.length).toBeGreaterThan(0);
    expect(session.park()).toBe(true);
    const resumed = createRunSession(() => 0, storage);
    resumed.start();
    const back = resumed.snapshot();
    expect(back.basket.goods.map((item) => item.id)).toEqual(parked.basket.goods.map((item) => item.id));
    expect(back.basket.powerUps.map((item) => item.id)).toEqual(parked.basket.powerUps.map((item) => item.id));
    expect([...back.shelvesTaken].sort()).toEqual([...parked.shelvesTaken].sort());
  });
});
