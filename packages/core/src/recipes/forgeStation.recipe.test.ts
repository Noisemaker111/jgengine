import { expect, test } from "bun:test";

import { changeStatPool, createStatPool, evaluatePredicate, type Predicate } from "../parts";

/**
 * @recipe Crafting recipe with station requirement
 * A Requirement names the station and skill, and the materials are Meters the craft drains.
 */
test("crafting recipe with station requirement", () => {
  let iron = createStatPool({ max: 99, current: 5 });
  const sword: Predicate = { all: [{ eq: ["station", "forge"] }, { gte: ["skill.smithing", 2] }, { gte: ["iron", 3] }] };
  const craft = (station: string) => {
    if (!evaluatePredicate(sword, { station, skill: { smithing: 2 }, iron: iron.current })) return false;
    iron = changeStatPool(iron, -3).pool;
    return true;
  };

  expect(craft("workbench")).toBe(false);
  expect(craft("forge")).toBe(true);
  expect(iron.current).toBe(2);
  expect(craft("forge")).toBe(false);
});
