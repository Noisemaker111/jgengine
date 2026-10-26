import { expect, test } from "bun:test";

import { bonusLevels, createKnockoutTaming, mealInterval, tamingScale, type KnockoutTamingConfig, type TamingEvent, type TamingFeeder } from "./knockoutTaming";

// A raptor's table from the ARK wiki: 180 torpor (+10.8/level), 7 raw meat in 5:51 at level 1.
const RAPTOR: KnockoutTamingConfig = {
  torpor: { base: 180, perLevel: 10.8 },
  torporDrain: { at1: 0.3, at30: 0.5 },
  foods: {
    raw_prime_meat: { countAt1: 3, secondsAt1: 151, countAt30: 5, secondsAt30: 251 },
    raw_meat: { countAt1: 7, secondsAt1: 351, countAt30: 15, secondsAt30: 751 },
  },
};

function pantry(stock: Record<string, number>): TamingFeeder {
  return {
    count: (itemId) => stock[itemId] ?? 0,
    take(itemId) {
      if ((stock[itemId] ?? 0) <= 0) return false;
      stock[itemId]! -= 1;
      return true;
    },
  };
}

test("table values scale linearly from level 1 to level 30", () => {
  expect(tamingScale(7, 15, 1)).toBe(7);
  expect(tamingScale(7, 15, 30)).toBe(15);
  expect(mealInterval(RAPTOR.foods.raw_meat!, 1)).toBeCloseTo(351 / 7);
});

test("eighteen club hits knock a level-1 raptor out, and it tames on seven raw meat in about six minutes", () => {
  const taming = createKnockoutTaming({ raptor: RAPTOR });
  taming.track("r1", "raptor", 1);
  let hits = 0;
  while (!taming.state("r1")!.unconscious) {
    hits += 1;
    if (taming.addTorpor("r1", 10)) break;
  }
  expect(hits).toBe(18);

  const stock = { raw_meat: 10 };
  const feeder = pantry(stock);
  let seconds = 0;
  let tamed: Extract<TamingEvent, { type: "tamed" }> | null = null;
  // A narcotic every minute keeps it under while it eats: 40 torpor over 16 s.
  while (tamed === null && seconds < 600) {
    if (seconds % 60 === 0) taming.dose("r1", { torpor: 40, seconds: 16 });
    for (const { event } of taming.tick(1, () => feeder)) if (event.type === "tamed") tamed = event;
    seconds += 1;
  }
  expect(tamed).not.toBeNull();
  expect(10 - stock.raw_meat).toBe(7);
  expect(seconds).toBeGreaterThan(300);
  expect(seconds).toBeLessThan(360);
  expect(tamed!.effectiveness).toBeLessThan(1);
  expect(taming.state("r1")).toBeNull();
});

test("a faster taming speed brings meals sooner without changing how much it eats", () => {
  const taming = createKnockoutTaming({ raptor: RAPTOR });
  taming.track("r1", "raptor", 1);
  taming.addTorpor("r1", 180);
  const stock = { raw_meat: 10 };
  let seconds = 0;
  let tamed = false;
  while (!tamed && seconds < 100) {
    for (const { event } of taming.tick(0.1, () => pantry(stock), 10)) if (event.type === "tamed") tamed = true;
    seconds += 0.1;
  }
  expect(tamed).toBe(true);
  expect(10 - stock.raw_meat).toBe(7);
  expect(seconds).toBeLessThan(36);
});

test("preferred food is eaten first, and a creature with no food loses progress", () => {
  const taming = createKnockoutTaming({ raptor: RAPTOR });
  taming.track("r1", "raptor", 1);
  taming.addTorpor("r1", 1000);
  const stock = { raw_meat: 5, raw_prime_meat: 1 };
  const eaten: string[] = [];
  for (const { event } of taming.tick(0.1, () => pantry(stock))) if (event.type === "ate") eaten.push(event.itemId);
  expect(eaten).toEqual(["raw_prime_meat"]);
  const after = taming.state("r1")!.progress;
  expect(after).toBeCloseTo(1 / 3);
  taming.dose("r1", { torpor: 1000, seconds: 1000 });
  for (let t = 0; t < 400; t += 1) taming.tick(1, () => null);
  expect(taming.state("r1")!.progress).toBeLessThan(after);
});

test("torpor running out wakes it and the tame is lost; damage while down costs effectiveness", () => {
  const taming = createKnockoutTaming({ raptor: RAPTOR });
  taming.track("r1", "raptor", 1);
  taming.addTorpor("r1", 180);
  taming.damage("r1", 0.5);
  expect(taming.state("r1")!.spent).toBeCloseTo(1);
  const events: TamingEvent[] = [];
  for (let t = 0; t < 700; t += 1) for (const { event } of taming.tick(1, () => null)) events.push(event);
  expect(events.some((event) => event.type === "woke")).toBe(true);
  expect(taming.state("r1")!.unconscious).toBe(false);
  expect(taming.state("r1")!.spent).toBe(0);
});

test("bonus levels follow ARK: floor(level × effectiveness / 2), and state round-trips", () => {
  expect(bonusLevels(90, 0.85)).toBe(38);
  expect(bonusLevels(150, 0.999)).toBe(74);
  const taming = createKnockoutTaming({ raptor: RAPTOR });
  taming.track("r1", "raptor", 12);
  taming.addTorpor("r1", 50);
  const saved = JSON.parse(JSON.stringify(taming.snapshot()));
  taming.reset();
  expect(taming.state("r1")).toBeNull();
  taming.restore(saved);
  expect(taming.state("r1")).toMatchObject({ level: 12, torpor: 50 });
});
