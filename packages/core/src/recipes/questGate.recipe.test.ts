import { expect, test } from "bun:test";

import { evaluatePredicate, type Predicate } from "../parts";

/**
 * @recipe Quest gate
 * A Requirement over facts the game names: level, quests done, items held. No code in the saved quest, only data.
 */
test("quest gate", () => {
  const dragonQuest: Predicate = {
    all: [{ gte: ["player.level", 10] }, { includes: ["quests.done", "intro"] }, { has: "items.dragonKey" }],
  };
  const facts = { player: { level: 12 }, quests: { done: ["intro"] }, items: {} as Record<string, number> };

  expect(evaluatePredicate(dragonQuest, facts)).toBe(false);
  facts.items.dragonKey = 1;
  expect(evaluatePredicate(dragonQuest, facts)).toBe(true);
  facts.player.level = 4;
  expect(evaluatePredicate(dragonQuest, facts)).toBe(false);
});
