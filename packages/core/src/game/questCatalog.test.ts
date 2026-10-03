import { describe, expect, test } from "bun:test";
import { validateQuestCatalog, type QuestCatalogDefinition } from "./questCatalog";

function quest(id: string, requires: string[] = [], unlocks: string[] = []): QuestCatalogDefinition {
  return { id, title: id, requires, objectives: [{ id: "task", kind: "custom", count: 1 }], rewards: { unlocks } };
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

describe("validateQuestCatalog", () => {
  test("locates duplicate ids and missing requirement/follow-up references", () => {
    const catalog = [quest("a"), {
      ...quest("a", ["missing"]),
      objectives: [{ id: "same", kind: "custom", count: 1 }, { id: "same", kind: "other", count: 1 }],
      rewards: { quests: ["absent"] },
    }];
    const errors = validateQuestCatalog(catalog).filter((issue) => issue.severity === "error");
    expect(errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "duplicate-quest", path: "/1/id" },
      { code: "missing-requirement", path: "/1/requires/0" },
      { code: "duplicate-objective", path: "/1/objectives/1/id" },
      { code: "missing-follow-up", path: "/1/rewards/quests/0" },
    ]);
  });

  test("objective ids are scoped to quests; no follow-up-only reachability assumption", () => {
    expect(validateQuestCatalog([quest("a"), quest("b")])).toEqual([]);
    expect(validateQuestCatalog([quest("a", [], []), { ...quest("b", ["a"]), rewards: { quests: ["a"] } }])).toEqual([]);
  });

  test("allows declared and catalog-produced unlocks, including multiple producers", () => {
    expect(validateQuestCatalog([
      quest("a", ["external"]), quest("b", ["gate"]), quest("c", [], ["gate"]),
    ], { externalUnlocks: ["external"] })).toEqual([]);
    expect(validateQuestCatalog([
      quest("a", ["gate"], ["gate"]), quest("b", [], ["gate"]),
    ])).toEqual([]);
  });

  test("a quest-id requirement can be satisfied by an unlock of the same id", () => {
    const catalog = [quest("a", ["b"]), quest("b", ["a"])];
    expect(validateQuestCatalog(catalog, { externalUnlocks: ["a"] })).toEqual([]);
    expect(validateQuestCatalog([...catalog, quest("c", [], ["a"])])).toEqual([]);
  });

  test("external starts bypass acceptance requirements; declarations are located", () => {
    expect(validateQuestCatalog([quest("a", ["b"]), quest("b", ["a"])], {
      externallyStartedQuests: ["a"],
    })).toEqual([]);
    expect(validateQuestCatalog([], { externallyStartedQuests: ["absent"] })).toEqual([
      { code: "missing-external-start", severity: "error", path: "", referenceId: "absent",
        message: 'Externally started quest "absent" does not exist in the catalog.' },
    ]);
  });

  test("reports cycles and downstream blockers as warnings, without blaming follow-up loops", () => {
    const issues = validateQuestCatalog([quest("a", ["b"]), quest("b", ["a"]), quest("c", ["b"])]);
    expect(issues.filter((issue) => issue.code === "blocked-prerequisites").map((issue) => issue.questId)).toEqual(["a", "b", "c"]);
    const cycle = issues.find((issue) => issue.code === "dependency-cycle")!;
    expect(new Set(cycle.relatedQuestIds)).toEqual(new Set(["a", "b"]));
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
    expect(validateQuestCatalog([
      { ...quest("x"), rewards: { quests: ["y"] } }, { ...quest("y"), rewards: { quests: ["x"] } },
    ])).toEqual([]);
  });

  test("unlock-producer cycles obey AND prerequisites and do not become errors", () => {
    const issues = validateQuestCatalog([quest("a", ["gate"], ["seal"]), quest("b", ["seal"], ["gate"])]);
    expect(issues.map((issue) => issue.code)).toEqual(["blocked-prerequisites", "blocked-prerequisites", "dependency-cycle"]);
    const andBlocked = validateQuestCatalog([quest("a", ["a", "b"]), quest("b", ["b"])], { externalUnlocks: ["a"] });
    expect(andBlocked.filter((issue) => issue.code === "blocked-prerequisites")).toHaveLength(2);
  });

  test("last duplicate defines topology, matching runtime registration", () => {
    const issues = validateQuestCatalog([quest("a", ["a"]), quest("a"), quest("b", ["a"])]);
    expect(issues.map((issue) => issue.code)).toEqual(["duplicate-quest"]);
  });

  test("counts preserve custom fractional/zero thresholds and item quantities", () => {
    for (const count of [0, 0.25, 1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateQuestCatalog([{ ...quest("a"), objectives: [{ id: "o", kind: "custom", count }],
        rewards: { items: [{ item: "i", inventory: "bag", count }], xp: { amount: -1 }, economy: { debt: -3.5 } },
      }])).toEqual([]);
    }
    for (const count of [-1, NaN, Infinity, -Infinity]) {
      const errors = validateQuestCatalog([{ ...quest("a"), objectives: [{ id: "o", kind: "custom", count }],
        rewards: { items: [{ item: "i", inventory: "bag", count }] },
      }]);
      expect(errors.map((issue) => issue.path)).toEqual(["/0/objectives/0/count", "/0/rewards/items/0/count"]);
    }
  });

  test("invalid amounts/radii and caller-owned reference policies have precise paths", () => {
    const issues = validateQuestCatalog({ "chapter/one~": {
      ...quest("a"), objectives: [{ id: "o", kind: "inspect", target: "site", item: "tool", count: 1,
        partyShare: { radius: -1, credit: "all" } }],
      rewards: { xp: { amount: NaN }, economy: { "credits/~": Infinity },
        items: [{ item: "award", inventory: "bag", count: 1 }] },
    } }, { hasReference: (kind, id, context) => {
      expect(context.quest.id).toBe("a");
      if (kind === "target") expect(context.objective?.kind).toBe("inspect");
      return id === "tool";
    } });
    expect(issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "invalid-radius", path: "/chapter~1one~0/objectives/0/partyShare/radius" },
      { code: "unknown-reference", path: "/chapter~1one~0/objectives/0/target" },
      { code: "unknown-reference", path: "/chapter~1one~0/rewards/items/0/item" },
      { code: "unknown-reference", path: "/chapter~1one~0/rewards/items/0/inventory" },
      { code: "invalid-amount", path: "/chapter~1one~0/rewards/xp/amount" },
      { code: "invalid-amount", path: "/chapter~1one~0/rewards/economy/credits~1~0" },
      { code: "unknown-reference", path: "/chapter~1one~0/rewards/economy/credits~1~0" },
    ]);
  });

  test("does not mutate deeply frozen input or consume declarations more than once", () => {
    const catalog = freeze([quest("a", ["entry"], ["gate"]), quest("b", ["gate"])]);
    const before = JSON.stringify(catalog);
    function* external() { yield "entry"; }
    expect(validateQuestCatalog(catalog, { externalUnlocks: external() })).toEqual([]);
    expect(JSON.stringify(catalog)).toBe(before);
  });

  test("iterative progression and SCC traversal handle a 30k chain and closed chain", () => {
    const length = 30_000;
    const catalog = Array.from({ length }, (_, index) => quest(`q${index}`, index ? [`q${index - 1}`] : []));
    expect(validateQuestCatalog(catalog)).toEqual([]);
    catalog[0] = quest("q0", [`q${length - 1}`]);
    const issues = validateQuestCatalog(catalog);
    expect(issues.filter((issue) => issue.code === "blocked-prerequisites")).toHaveLength(length);
    expect(issues.find((issue) => issue.code === "dependency-cycle")?.relatedQuestIds).toHaveLength(length);
    expect(validateQuestCatalog(catalog, { externallyStartedQuests: ["q0"] })).toEqual([]);
  });
});
