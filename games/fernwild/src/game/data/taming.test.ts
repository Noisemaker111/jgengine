import { expect, test } from "bun:test";

import { createKnockoutTaming, type TamingEvent, type TamingSupply } from "../knockoutTaming";
import { SPECIES } from "./species";
import { bonusLevels } from "./taming";

type Won = Extract<TamingEvent, { type: "won" }>;

/** Every species' table, as the game builds it. */
const taming = () => createKnockoutTaming(Object.fromEntries(Object.values(SPECIES).map((def) => [def.id, def.taming])));

function pantry(stock: Record<string, number>): TamingSupply {
  return {
    count: (itemId) => stock[itemId] ?? 0,
    take(itemId) {
      const held = stock[itemId] ?? 0;
      if (held <= 0) return false;
      stock[itemId] = held - 1;
      return true;
    },
  };
}

/** Tick a downed creature second by second, a narcotic every minute keeping it under, until it is tamed or `limit` passes. */
function feedUntilTamed(run: ReturnType<typeof taming>, id: string, stock: Record<string, number>, limit: number, narcotics = true) {
  const feeder = pantry(stock);
  let seconds = 0;
  let won: Won | null = null;
  const events: TamingEvent[] = [];
  while (won === null && seconds < limit) {
    if (narcotics && seconds % 60 === 0) run.dose(id, { vital: "torpor", amount: 40, seconds: 16 });
    for (const { event } of run.tick(1, () => feeder)) {
      events.push(event);
      if (event.type === "won") won = event;
    }
    seconds += 1;
  }
  return { won, seconds, events };
}

test("a level-1 raptor: 180 torpor in eighteen ten-point hits, then seven raw meat in about six minutes", () => {
  const run = taming();
  run.track("r1", "raptor", 1);
  expect(run.state("r1")?.maxTorpor).toBe(180);
  let hits = 0;
  while (run.state("r1")?.subdued !== true) {
    hits += 1;
    if (run.subdue("r1", 10)) break;
  }
  expect(hits).toBe(18);
  const stock = { raw_meat: 10 };
  const { won, seconds } = feedUntilTamed(run, "r1", stock, 600);
  expect(won).not.toBeNull();
  expect(stock.raw_meat).toBe(3);
  expect(seconds).toBeGreaterThan(300);
  expect(seconds).toBeLessThan(360);
  // Seven meals at 0.03 ineffectiveness each: 1 / (1 + 0.21).
  expect(won?.effectiveness).toBeCloseTo(1 / 1.21, 6);
  expect(run.state("r1")).toBeNull();
});

test("the table grows with level: a level-30 raptor needs fifteen raw meat and its torpor is 29 levels higher", () => {
  const run = taming();
  run.track("r1", "raptor", 30);
  expect(run.state("r1")?.maxTorpor).toBeCloseTo(180 + 29 * 10.8);
  run.subdue("r1", 10000);
  const stock = { raw_meat: 20 };
  expect(feedUntilTamed(run, "r1", stock, 900).won).not.toBeNull();
  expect(stock.raw_meat).toBe(5);
});

test("it eats its favourite first: Simple Kibble over raw meat, and two kibble tame a level-1 raptor", () => {
  const run = taming();
  run.track("r1", "raptor", 1);
  run.subdue("r1", 1000);
  const stock = { raw_meat: 10, kibble_simple: 5 };
  const { won, events } = feedUntilTamed(run, "r1", stock, 600);
  expect(won).not.toBeNull();
  expect(events.filter((event) => event.type === "ate").map((event) => (event.type === "ate" ? event.itemId : ""))).toEqual(["kibble_simple", "kibble_simple"]);
  expect(stock.raw_meat).toBe(10);
});

test("waking up loses the tame: left with no narcotics, a raptor wakes and its affinity is gone", () => {
  const run = taming();
  run.track("r1", "raptor", 1);
  run.subdue("r1", 1000);
  const { won, events } = feedUntilTamed(run, "r1", { raw_meat: 2 }, 1200, false);
  expect(won).toBeNull();
  expect(events.some((event) => event.type === "released")).toBe(true);
  expect(run.state("r1")?.subdued).toBe(false);
  expect(run.state("r1")?.progress).toBe(0);
});

test("hitting a downed creature costs effectiveness", () => {
  const run = taming();
  run.track("clean", "raptor", 1);
  run.track("hit", "raptor", 1);
  run.subdue("clean", 1000);
  run.subdue("hit", 1000);
  run.hurt("hit", 0.25);
  expect(run.state("hit")?.effectiveness).toBeCloseTo(1 / 1.5, 6);
  expect(run.state("clean")?.effectiveness).toBe(1);
});

test("bonus levels follow ARK: floor(level × effectiveness / 2)", () => {
  expect(bonusLevels(90, 0.85)).toBe(38);
  expect(bonusLevels(150, 0.999)).toBe(74);
  expect(bonusLevels(1, 0.8)).toBe(0);
});
