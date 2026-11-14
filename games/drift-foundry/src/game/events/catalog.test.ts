import { describe, expect, test } from "bun:test";

import { createMedalBoard } from "@jgengine/core/progression/medalBoard";

import { CAREER_KEY, newCareer, readCareer, type CareerStorage } from "../career";
import { createRunSession, type RunSession } from "../run/session";
import { trackById } from "../tracks/catalog";
import { eventById, eventCompactor, MEDAL_BOARD, YARD_EVENTS, YARD_TIERS } from "./catalog";
import { COMPACTOR_PLAN, compactorZAt } from "../compactor/schedule";
import { driveCourse, type CourseDriveOptions } from "../testing/courseDriver";

const DT = 1 / 60;

function memory(seed?: (career: ReturnType<typeof newCareer>) => void): CareerStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (seed !== undefined) {
    const career = newCareer();
    seed(career);
    map.set(CAREER_KEY, JSON.stringify(career));
  }
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) };
}

/** A scripted run on the event's own track: `sweep` takes every mod display, `shop` every shelf grab, `take` the named shortcuts, `stall` brakes from 12 s. */
function drive(session: RunSession, options: CourseDriveOptions = {}): void {
  driveCourse(session, options);
}

const everyTierOpen = (career: ReturnType<typeof newCareer>) => {
  career.medals = { best: { "last-call": 1, "cart-stuffer": 200, "lights-out": 20, "grudge-brick": 9 } };
};

function race(eventId: string, options: CourseDriveOptions = {}) {
  const session = createRunSession(() => 0, memory(everyTierOpen));
  expect(session.selectEvent(eventId)).toEqual({ ok: true });
  session.start();
  drive(session, options);
  return session.snapshot();
}

describe("weekly circular", () => {
  test("the authored calendar is a valid medal board and every tier holds events", () => {
    expect(() => createMedalBoard(MEDAL_BOARD)).not.toThrow();
    for (const tier of YARD_TIERS) expect(YARD_EVENTS.some((event) => event.tier === tier.id)).toBe(true);
  });

  test("a new career can shop the Weeknight tier only; the Late Shift asks for medals first", () => {
    const session = createRunSession(() => 0, memory());
    expect(session.selectEvent("price-check").ok).toBe(true);
    expect(session.selectEvent("lights-out")).toMatchObject({ ok: false });
    const calendar = session.snapshot().calendar;
    expect(calendar.tiers.map((tier) => tier.open)).toEqual([true, false, false, false]);
    expect(calendar.tiers[1]!.missing).toBe(4);
  });

  test("events change the grid and customer service: Price Check races alone, Empty Cart starts with no mods", () => {
    const owned = (career: ReturnType<typeof newCareer>) => {
      everyTierOpen(career);
      career.ladders = { ranks: { engine: 2, front: 3, wheels: 2 } };
    };
    const session = createRunSession(() => 0, memory(owned));
    session.selectEvent("price-check");
    expect(session.snapshot().rivals).toHaveLength(0);
    expect(session.snapshot().race.total).toBe(1);
    expect(Object.values(session.snapshot().installed).filter(Boolean)).toHaveLength(3);
    session.selectEvent("empty-cart");
    expect(session.snapshot().rivals).toHaveLength(3);
    expect(Object.values(session.snapshot().installed).filter(Boolean)).toHaveLength(0);
  });

  test("the night crew's shutters are closer and faster than the usual closing's", () => {
    const night = eventCompactor(eventById("lights-out")!, COMPACTOR_PLAN);
    for (const t of [0, 10, 30, 50]) expect(compactorZAt(t, night)).toBeGreaterThan(compactorZAt(t, COMPACTOR_PLAN) + 14);
  });

  test("a four-second stall is survivable on Last Call and fatal on Lights Out and Shutter Rush", () => {
    expect(race("last-call", { stall: 4 }).phase).toBe("won");
    expect(race("lights-out", { stall: 4 }).phase).toBe("crushed");
    expect(race("shutter-rush", { stall: 4 }).phase).toBe("crushed");
  });

  test("a clean line earns bronze on Price Check in Produce; gold needs the mod sweep and the salad bar", () => {
    const line = race("price-check");
    expect(line.outcome?.event.medal).toBe("bronze");
    expect(line.outcome?.event.next?.medal).toBe("silver");
    expect(line.outcome?.lineNotes.some((note) => note.startsWith("P1"))).toBe(false);
    expect(race("price-check", { take: ["salad-bar"] }).outcome?.event.medal).toBe("bronze");
    const sweep = race("price-check", { sweep: true, take: ["salad-bar"] });
    expect(sweep.outcome?.event.medal).toBe("gold");
  });

  test("first-time medals pay once, bank with the escape and open the next tier", () => {
    const storage = memory();
    const session = createRunSession(() => 0, storage);
    session.selectEvent("price-check");
    session.start();
    drive(session, { sweep: true, take: ["salad-bar"] });
    const gold = session.snapshot();
    expect(gold.outcome?.event.firstTime.map((entry) => entry.medal)).toEqual(["bronze", "silver", "gold"]);
    expect(gold.outcome?.event.reward).toBe(60 + 120 + 220);
    expect(gold.career.credits).toBe(gold.outcome!.banked + 400);
    expect(gold.calendar.points).toBe(3);

    session.restart();
    drive(session, { sweep: true, take: ["salad-bar"] });
    expect(session.snapshot().outcome?.event.reward).toBe(0);

    session.selectEvent("cart-stuffer");
    session.start();
    drive(session, { sweep: true, shop: true });
    const opened = session.snapshot();
    expect(opened.outcome?.event.medal).toBe("gold");
    expect(opened.outcome?.event.openedTiers).toEqual(["Late Shift"]);
    expect(opened.calendar.tiers[1]!.open).toBe(true);
    expect(readCareer(storage).medals.best["cart-stuffer"]).toBe(opened.outcome!.cartValue);
  });

  test("a career saved before the calendar loads with no medals on the salvage run", () => {
    const storage = memory();
    const legacy = newCareer() as Partial<ReturnType<typeof newCareer>>;
    delete legacy.medals;
    delete legacy.event;
    storage.setItem(CAREER_KEY, JSON.stringify(legacy));
    const career = readCareer(storage);
    expect(career.medals).toEqual({ best: {} });
    expect(career.event).toBe("last-call");
  });

  test("an event moved onto a new track drops the best it set on Row Six; events still there keep theirs", () => {
    const storage = memory();
    const legacy = newCareer() as Partial<ReturnType<typeof newCareer>>;
    delete legacy.courses;
    legacy.medals = { best: { "last-call": 1, "price-check": 30, "shutter-rush": 31 } };
    storage.setItem(CAREER_KEY, JSON.stringify(legacy));
    expect(readCareer(storage).medals.best).toEqual({ "last-call": 1, "shutter-rush": 31 });
    const current = newCareer();
    current.medals = { best: { "price-check": 50 } };
    storage.setItem(CAREER_KEY, JSON.stringify(current));
    expect(readCareer(storage).medals.best).toEqual({ "price-check": 50 });
  });

  test("every event names a real track, and the calendar runs at least five of them", () => {
    const tracks = new Set(YARD_EVENTS.map((event) => event.track));
    for (const id of tracks) expect(trackById(id)).not.toBeNull();
    expect(tracks.size).toBeGreaterThanOrEqual(5);
  });
});
