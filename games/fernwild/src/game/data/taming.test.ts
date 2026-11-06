import { expect, test } from "bun:test";

import type { DoseSupply } from "@jgengine/core/stats/doseTable";

import { createKnockoutTaming, type TamingEvent } from "../knockoutTaming";
import { SPECIES } from "./species";
import { bonusLevels } from "./taming";

type Won = Extract<TamingEvent, { type: "won" }>;

/** Every species' table, as the game builds it. */
const taming = () => createKnockoutTaming(Object.fromEntries(Object.values(SPECIES).map((def) => [def.id, def.taming])));

function pantry(stock: Record<string, number>): DoseSupply {
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
    if (run.hit("r1", [{ vital: "torpor", amount: 10 }])) break;
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
  run.hit("r1", [{ vital: "torpor", amount: 10000 }]);
  const stock = { raw_meat: 20 };
  expect(feedUntilTamed(run, "r1", stock, 900).won).not.toBeNull();
  expect(stock.raw_meat).toBe(5);
});

test("it eats its favourite first: Simple Kibble over raw meat, and two kibble tame a level-1 raptor", () => {
  const run = taming();
  run.track("r1", "raptor", 1);
  run.hit("r1", [{ vital: "torpor", amount: 1000 }]);
  const stock = { raw_meat: 10, kibble_simple: 5 };
  const { won, events } = feedUntilTamed(run, "r1", stock, 600);
  expect(won).not.toBeNull();
  expect(events.filter((event) => event.type === "ate").map((event) => (event.type === "ate" ? event.itemId : ""))).toEqual(["kibble_simple", "kibble_simple"]);
  expect(stock.raw_meat).toBe(10);
});

test("waking up loses the tame: left with no narcotics, a raptor wakes and its affinity is gone", () => {
  const run = taming();
  run.track("r1", "raptor", 1);
  run.hit("r1", [{ vital: "torpor", amount: 1000 }]);
  const { won, events } = feedUntilTamed(run, "r1", { raw_meat: 2 }, 1200, false);
  expect(won).toBeNull();
  expect(events.some((event) => event.type === "released")).toBe(true);
  expect(run.state("r1")?.subdued).toBe(false);
  expect(run.state("r1")?.progress).toBe(0);
});

test("waking is not instant: it stays out until its torpor and a narcotic still taking effect wear off", () => {
  const run = taming();
  run.track("r1", "raptor", 1);
  run.hit("r1", [{ vital: "torpor", amount: 1000 }]);
  // Full at 180; a level-1 raptor's torpor wears off 0.3 a second. At 200 s, with 60 of room, a narcotic
  // adds 40 over 16 s. It wakes at 0.2% of full: (180 + 40 - 0.36) / 0.3 = 732 s, its belly empty throughout.
  const none = pantry({});
  let woke = -1;
  const told: number[] = [];
  for (let second = 1; second <= 1000 && woke < 0; second += 1) {
    if (second === 201) run.dose("r1", { vital: "torpor", amount: 40, seconds: 16 });
    // What the panel says while the narcotic lands, and after.
    if (second === 205 || second === 400) told.push(second + (run.state("r1")?.wakesIn ?? 0));
    for (const { event } of run.tick(1, () => none)) if (event.type === "released") woke = second;
  }
  for (const when of told) expect(Math.abs(when - woke)).toBeLessThanOrEqual(2);
  expect(woke).toBeGreaterThanOrEqual(732);
  expect(woke).toBeLessThanOrEqual(734);
});

test("a narcotic fed at full torpor is wasted: torpor never goes past its max", () => {
  const run = taming();
  run.track("r1", "raptor", 1);
  run.hit("r1", [{ vital: "torpor", amount: 1000 }]);
  run.dose("r1", { vital: "torpor", amount: 40, seconds: 16 });
  run.tick(16, () => null);
  expect(run.state("r1")?.torpor).toBeLessThanOrEqual(180);
});

test("hitting a downed creature costs effectiveness", () => {
  const run = taming();
  run.track("clean", "raptor", 1);
  run.track("hit", "raptor", 1);
  run.hit("clean", [{ vital: "torpor", amount: 1000 }]);
  run.hit("hit", [{ vital: "torpor", amount: 1000 }]);
  run.hurt("hit", 0.25);
  expect(run.state("hit")?.effectiveness).toBeCloseTo(1 / 1.5, 6);
  expect(run.state("clean")?.effectiveness).toBe(1);
});

test("bonus levels follow ARK: floor(level × effectiveness / 2)", () => {
  expect(bonusLevels(90, 0.85)).toBe(38);
  expect(bonusLevels(150, 0.999)).toBe(74);
  expect(bonusLevels(1, 0.8)).toBe(0);
});

test("a bola's hold is a dose like any other: it fills the held meter, wears off a second at a time, and a second bola tops it up", () => {
  const run = taming();
  run.track("r1", "raptor", 1);
  const bola = [{ vital: "held", amount: 15 }];
  expect(run.hit("r1", bola)).toBe(false);
  expect(run.state("r1")?.held).toBe(15);
  run.tick(10, () => null);
  expect(run.state("r1")?.held).toBeCloseTo(5, 9);
  run.hit("r1", bola);
  expect(run.state("r1")?.held).toBeCloseTo(20, 9);
  run.tick(25, () => null);
  expect(run.state("r1")?.held).toBe(0);
  // Torpor and hold are separate meters: being held does not knock it out.
  expect(run.state("r1")?.subdued).toBe(false);
});
