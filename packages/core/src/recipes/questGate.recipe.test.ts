import { expect, test } from "bun:test";

import { evaluatePredicate, type Predicate } from "../parts";

/**
 * @recipe Quest gate
 * A Requirement over facts the game names: level, quests done, items held. No code in the saved quest, only data.
 */
test("quest gate", () => {
  const dragonQuest: Predicate = {
    all: [{ gte: ["player.level", 10] }, { includes: ["quests.done", "intro"] }, { includes: ["items", "dragonKey"] }],
  };
  const mayStart = (facts: Record<string, unknown>) => evaluatePredicate(dragonQuest, facts);
  const facts = { player: { level: 12 }, quests: { done: ["intro"] }, items: ["torch"] };

  expect(mayStart(facts)).toBe(false);
  facts.items.push("dragonKey");
  expect(mayStart(facts)).toBe(true);
  facts.player.level = 4;
  expect(mayStart(facts)).toBe(false);
});
