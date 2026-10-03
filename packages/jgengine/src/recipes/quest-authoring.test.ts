import { expect, mock, test } from "bun:test";
import { validateQuestCatalog } from "../../../core/src/game/questCatalog";
import type { QuestAuthoringFacts } from "./snippets/quest-authoring";

// CLI snippets depend on consumer-installed SDK packages; alias to the real implementation for this test.
mock.module("@jgengine/core/game/questCatalog", () => ({ validateQuestCatalog }));
const { authorQuestBatch } = await import("./snippets/quest-authoring");

const facts: QuestAuthoringFacts = {
  revision: "reviewed-1", statements: { "world-rule": ["Caller-owned reviewed fact"] },
  catalogs: { item: ["tool"], target: ["site"], inventory: ["bag"], currency: ["credit"] },
  externalUnlocks: ["world-entry"], externallyStartedQuests: [],
};
const limits = { maxNewQuests: 2, maxTotalQuests: 5, maxObjectivesPerQuest: 3, maxReferencesPerQuest: 10 };

test("authoring adopter supplies canonical facts and exact batch repair locations", async () => {
  const previous = [{ id: "established", title: "Caller text", objectives: [] }];
  const before = JSON.stringify({ facts, previous });
  const review = await authorQuestBatch(facts, previous, limits, async (request) => {
    expect(request.canonicalFacts).not.toBe(facts);
    expect(request.canonicalFacts).toEqual(facts);
    expect(Object.isFrozen(request.canonicalFacts.catalogs.target)).toBe(true);
    expect(request.establishedQuests).not.toBe(previous);
    expect(request.establishedQuests).toEqual(previous);
    return [{ id: "new", title: "Generated caller text", requires: ["world-entry", "established"],
      objectives: [{ id: "inspect", kind: "custom", target: "typo", count: 0.5 }],
      rewards: { quests: ["typo-quest"] } }];
  });
  expect(review.candidate).toBeNull();
  expect(review.factsRevision).toBe("reviewed-1");
  expect(review.repair.map(({ code, path }) => ({ code, path }))).toEqual([
    { code: "unknown-reference", path: "/1/objectives/0/target" },
    { code: "missing-follow-up", path: "/1/rewards/quests/0" },
  ]);
  expect(JSON.stringify({ facts, previous })).toBe(before);
  const repaired = await authorQuestBatch(facts, previous, limits, async () => [{
    id: "new", title: "Caller text", requires: ["world-entry", "established"],
    objectives: [{ id: "inspect", kind: "custom", target: "site", count: 0.5 }],
  }]);
  expect(repaired.candidate).toHaveLength(2);
  expect(repaired.diagnostics).toEqual([]);
});

test("authoring adopter bounds generation and retains warnings for caller review", async () => {
  await expect(authorQuestBatch(facts, [], { ...limits, maxNewQuests: -1 }, async () => [])).rejects.toThrow("Invalid authoring limit");
  await expect(authorQuestBatch(facts, [], { ...limits, maxNewQuests: 0 }, async () => [{
    id: "a", title: "Caller text", objectives: [],
  }])).rejects.toThrow("quest limits");
  await expect(authorQuestBatch(facts, [], { ...limits, maxReferencesPerQuest: 0 }, async () => [{
    id: "a", title: "Caller text", requires: ["world-entry"], objectives: [],
  }])).rejects.toThrow("objective/reference limits");
  const review = await authorQuestBatch(facts, [], limits, async () => [{
    id: "a", title: "Caller text", requires: ["a"], objectives: [],
  }]);
  expect(review.candidate).toHaveLength(1);
  expect(review.repair).toEqual([]);
  expect(review.diagnostics.map((issue) => issue.code)).toEqual(["blocked-prerequisites", "dependency-cycle"]);
});


test("authoring review retains detached facts, catalog and limits across an async generator", async () => {
  const callerFacts = structuredClone(facts);
  const callerLimits = { ...limits };
  const previous = [{ id: "established", title: "Reviewed text", objectives: [] }];
  const review = await authorQuestBatch(callerFacts, previous, callerLimits, async (request) => {
    expect(() => { request.canonicalFacts.catalogs.target.push("typo"); }).toThrow();
    callerFacts.revision = "unreviewed-2";
    callerFacts.catalogs.target = ["typo"];
    callerLimits.maxNewQuests = 0;
    previous[0]!.title = "Changed while awaiting";
    await Promise.resolve();
    return [{ id: "new", title: "Caller text", objectives: [{ id: "inspect", kind: "custom", target: "typo", count: 1 }] }];
  });
  expect(review.factsRevision).toBe("reviewed-1");
  expect(review.candidate).toBeNull();
  expect(review.repair).toMatchObject([{ code: "unknown-reference", path: "/1/objectives/0/target" }]);
  const accepted = await authorQuestBatch(facts, [{ id: "established", title: "Reviewed text", objectives: [] }], limits,
    async () => [{ id: "new", title: "Caller text", objectives: [] }]);
  expect(accepted.candidate?.[0]?.title).toBe("Reviewed text");
  expect(Object.isFrozen(accepted.candidate?.[0])).toBe(true);
});
