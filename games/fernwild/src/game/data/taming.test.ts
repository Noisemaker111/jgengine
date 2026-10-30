import { expect, test } from "bun:test";

import { createSubdualFeeding, type FeedingSupply, type SubdualFeedingEvent } from "@jgengine/core/subdual/subdualFeeding";

import { speciesDef } from "./species";
import { bonusLevels } from "./taming";

type Won = Extract<SubdualFeedingEvent, { type: "won" }>;

/** The raptor's table from the ARK wiki: 180 torpor (+10.8/level), 7 raw meat in 5:51 at level 1. */
function raptorTaming() {
  const raptor = speciesDef("raptor");
  if (raptor === null) throw new Error("the raptor is missing from the species table");
  return createSubdualFeeding({ raptor: raptor.taming });
}

function pantry(stock: Record<string, number>): FeedingSupply {
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

test("a level-1 raptor: 180 torpor in eighteen ten-point hits, then seven raw meat in about six minutes", () => {
  const taming = raptorTaming();
  taming.track("r1", "raptor", 1);
  expect(taming.capacity("r1")).toBe(180);
  let hits = 0;
  while (taming.state("r1")?.subdued !== true) {
    hits += 1;
    if (taming.subdue("r1", 10)) break;
  }
  expect(hits).toBe(18);

  const stock = { raw_meat: 10 };
  const feeder = pantry(stock);
  let seconds = 0;
  let won: Won | null = null;
  // A narcotic every minute keeps it under while it eats: 40 torpor over 16 s.
  while (won === null && seconds < 600) {
    if (seconds % 60 === 0) taming.dose("r1", { amount: 40, seconds: 16 });
    for (const { event } of taming.tick(1, () => feeder)) if (event.type === "won") won = event;
    seconds += 1;
  }
  expect(won).not.toBeNull();
  expect(stock.raw_meat).toBe(3);
  expect(seconds).toBeGreaterThan(300);
  expect(seconds).toBeLessThan(360);
  expect(won?.quality).toBeLessThan(1);
  expect(taming.state("r1")).toBeNull();
});

test("the table grows with level: a level-30 raptor needs fifteen raw meat and its torpor is 29 levels higher", () => {
  const taming = raptorTaming();
  taming.track("r1", "raptor", 30);
  expect(taming.capacity("r1")).toBeCloseTo(180 + 29 * 10.8);
  taming.subdue("r1", 10000);
  const stock = { raw_meat: 20 };
  const feeder = pantry(stock);
  let seconds = 0;
  let won: Won | null = null;
  while (won === null && seconds < 900) {
    if (seconds % 60 === 0) taming.dose("r1", { amount: 40, seconds: 16 });
    for (const { event } of taming.tick(1, () => feeder)) if (event.type === "won") won = event;
    seconds += 1;
  }
  expect(won).not.toBeNull();
  expect(stock.raw_meat).toBe(5);
});

test("bonus levels follow ARK: floor(level × effectiveness / 2)", () => {
  expect(bonusLevels(90, 0.85)).toBe(38);
  expect(bonusLevels(150, 0.999)).toBe(74);
  expect(bonusLevels(1, 0.8)).toBe(0);
});
