import { expect, test } from "bun:test";

import { createStatPoints } from "./statPoints";

const survivor = createStatPoints({
  stats: { health: { base: 100, perPoint: 10 }, melee: { base: 100, perPoint: 5 } },
});
const tame = createStatPoints({
  stats: { health: { base: 200, perPoint: 0.054, mode: "scale" }, stamina: { base: 150, perPoint: 0.1, mode: "scale" } },
  maxPerStat: 3,
});

test("a point adds its amount, and only earned points can be spent", () => {
  const sheet = survivor.empty();
  expect(survivor.value(sheet, "health")).toBe(100);
  expect(survivor.spend(sheet, "health", 2)).toBe(true);
  expect(survivor.spend(sheet, "melee", 2)).toBe(true);
  expect(survivor.spend(sheet, "health", 2)).toBe(false);
  expect(survivor.value(sheet, "health")).toBe(110);
  expect(survivor.value(sheet, "melee")).toBe(105);
  expect(survivor.unspent(sheet, 5)).toBe(3);
});

test("a scaling point grows the stat by a fraction of the owner's own base, up to the cap", () => {
  const sheet = tame.empty();
  for (let i = 0; i < 5; i += 1) tame.spend(sheet, "health", 10);
  expect(sheet.health).toBe(3);
  // A level-11 raptor tamed at 600 health: each point is 5.4% of 600.
  expect(tame.value(sheet, "health", 600)).toBeCloseTo(600 + 3 * 32.4, 6);
  expect(tame.gain("stamina")).toBeCloseTo(15, 6);
});

test("saved sheets come back with every stat and nothing else", () => {
  expect(tame.normalize({ health: 2, speed: 9 })).toEqual({ health: 2, stamina: 0 });
  expect(tame.spend(tame.empty(), "speed" as "health", 10)).toBe(false);
});
