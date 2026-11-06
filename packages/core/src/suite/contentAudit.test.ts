import { describe, expect, test } from "bun:test";

import { auditSuiteContent, recipeContent, type SuiteContent } from "./contentAudit";

const recipes = recipeContent([
  { id: "pick", inputs: [{ itemId: "stone", count: 1 }], outputs: [{ itemId: "pick", count: 1 }], seconds: 1 },
  { id: "drug", inputs: [{ itemId: "rot", count: 1 }], outputs: [{ itemId: "drug", count: 1 }], seconds: 1, station: "mortar", requires: ["learn_drug"] },
  { id: "mortar", inputs: [{ itemId: "stone", count: 5 }], outputs: [{ itemId: "mortar", count: 1 }], seconds: 1 },
  { id: "box", inputs: [{ itemId: "stone", count: 5 }], outputs: [{ itemId: "box", count: 1 }], seconds: 1 },
  { id: "sling", inputs: [{ itemId: "stone", count: 2 }], outputs: [{ itemId: "sling", count: 1 }], seconds: 1 },
]);

function sheet(overrides: Partial<SuiteContent> = {}): SuiteContent {
  return {
    items: [{ id: "stone" }, { id: "pick" }, { id: "rot" }, { id: "drug" }, { id: "mortar", placeable: true }, { id: "box", placeable: true }, { id: "sling", ammo: [] }],
    start: ["stone"],
    sources: recipes.sources,
    uses: [...recipes.uses, { id: "equip", path: "tools", items: ["pick", "sling"] }, { id: "eat", path: "food", items: ["drug"] }],
    places: ["mortar"],
    runway: { axis: "level", cap: 100, unlocks: [{ id: "learn_drug", at: 6 }, { id: "x", at: 24 }] },
    ...overrides,
  };
}

const byId = (results: ReturnType<typeof auditSuiteContent>) => new Map(results.map((result) => [result.id, result]));

describe("auditSuiteContent", () => {
  test("finds the shallow-content failures: no source, no use, blocked recipe, unplaceable, no ammo, short runway", () => {
    const results = byId(auditSuiteContent(sheet()));
    expect(results.get("content.item-source")?.problems).toEqual(["no source for rot, drug"]);
    expect(results.get("content.item-use")?.problems).toEqual(["no use for box"]);
    expect(results.get("content.recipes-reachable")?.problems[0]).toContain('"recipe:drug" is blocked by "rot"');
    expect(results.get("content.placeables-place")?.problems[0]).toContain("box");
    expect(results.get("content.weapons-have-ammo")?.problems).toEqual(["sling fires but takes no ammo"]);
    expect(results.get("progression.runway")?.problems).toEqual(["nothing unlocks between level 6 and 24", "the last unlock is at level 24 of a cap of 100"]);
  });

  test("passes once every gap is closed", () => {
    const results = auditSuiteContent(sheet({
      items: [{ id: "stone" }, { id: "pick" }, { id: "rot" }, { id: "drug" }, { id: "mortar", placeable: true }, { id: "box", placeable: true }, { id: "sling", ammo: ["stone"] }],
      sources: [...recipes.sources, { id: "spoil", path: "spoil", requires: ["pick"], provides: ["rot"] }],
      places: ["mortar", "box"],
      runway: { axis: "level", cap: 30, unlocks: [{ id: "learn_drug", at: 1 }, ...[3, 6, 9, 12, 15, 18, 21, 24, 27, 30].map((at) => ({ id: `u${at}`, at }))] },
    }));
    expect(results.filter((result) => !result.ok)).toEqual([]);
  });

  test("an unlock above the cap is never reachable", () => {
    const results = byId(auditSuiteContent(sheet({ runway: { axis: "level", cap: 5, unlocks: [{ id: "learn_drug", at: 6 }, { id: "a", at: 1 }, { id: "b", at: 4 }] } })));
    expect(results.get("content.recipes-reachable")?.problems.join(" ")).toContain("learn_drug");
  });
});
