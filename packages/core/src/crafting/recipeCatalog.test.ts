import { describe, expect, test } from "bun:test";
import { createEmptyInventory, putItem } from "../inventory/inventoryModel";
import { canCraft, type RecipeDef } from "./recipe";
import { validateRecipeCatalog } from "./recipeCatalog";

describe("recipe catalog validation", () => {
  test("valid custom references, fractional/zero counts and empty outputs pass", () => {
    const catalog: RecipeDef[] = [
      { id: "distill-memory", inputs: [{ itemId: "mist", count: 0.25 }, { itemId: "vow", count: 0 }],
        outputs: [{ itemId: "echo", count: 0.5 }, { itemId: "silence", count: 0 }],
        seconds: 0, stationRange: 0, station: "listening-room", requires: ["remembered-name"] },
      { id: "release-memory", inputs: [{ itemId: "echo", count: 1 }], outputs: [], category: "farewells" },
    ];
    const known = { item: new Set(["mist", "vow", "echo", "silence"]), station: new Set(["listening-room"]), unlock: new Set(["remembered-name"]) };
    expect(validateRecipeCatalog(catalog, { hasReference: (kind, id) => known[kind].has(id) })).toEqual([]);
  });

  test("catalogs omitted by the caller leave references unchecked", () => {
    const recipe: RecipeDef = { id: "custom", inputs: [{ itemId: "external-input", count: 1 }], outputs: [], station: "external-station", requires: ["external-unlock"] };
    expect(validateRecipeCatalog([recipe])).toEqual([]);
    expect(validateRecipeCatalog([recipe], { hasReference: (kind, id) => kind !== "item" || id === "external-input" })).toEqual([]);
  });

  test("locates broken input, output, station and unlock references with repairs", () => {
    const issues = validateRecipeCatalog([
      { id: "forge-seal", inputs: [{ itemId: "unknown-ore", count: 1 }], outputs: [{ itemId: "unknown-seal", count: 1 }], station: "unknown-forge", requires: ["smith", "unknown-training"] },
    ], { hasReference: (_kind, id) => id === "smith" });
    expect(issues.map(({ code, path, contentId, referenceId }) => ({ code, path, contentId, referenceId }))).toEqual([
      { code: "unknown-reference", path: "/0/inputs/0/itemId", contentId: "forge-seal", referenceId: "unknown-ore" },
      { code: "unknown-reference", path: "/0/outputs/0/itemId", contentId: "forge-seal", referenceId: "unknown-seal" },
      { code: "unknown-reference", path: "/0/station", contentId: "forge-seal", referenceId: "unknown-forge" },
      { code: "unknown-reference", path: "/0/requires/1", contentId: "forge-seal", referenceId: "unknown-training" },
    ]);
    expect(issues.every((issue) => issue.severity === "error" && issue.repair.includes(issue.referenceId!))).toBe(true);
  });

  test("rejects duplicate input rows that otherwise undercheck the required inventory", () => {
    const recipe: RecipeDef = { id: "seal", inputs: [{ itemId: "ore", count: 2 }, { itemId: "ore", count: 2 }], outputs: [] };
    const layout = { slots: 1 };
    const traits = { stackLimit: () => 99 };
    const stock = putItem(createEmptyInventory(layout), layout, traits, "ore", 3);
    expect(stock.status).toBe("ok");
    if (stock.status !== "ok") throw new Error("could not stock fixture");
    expect(canCraft(stock.state, layout, traits, recipe)).toEqual({ ok: true });
    const issues = validateRecipeCatalog([recipe]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "duplicate-input", path: "/0/inputs/1/itemId", contentId: "seal", referenceId: "ore" });
    expect(issues[0]!.repair).toContain("Combine");
    const repaired = { ...recipe, inputs: [{ itemId: "ore", count: 4 }] };
    expect(validateRecipeCatalog([repaired])).toEqual([]);
    expect(canCraft(stock.state, layout, traits, repaired)).toMatchObject({ ok: false, reason: "missing-inputs" });
  });

  test("repeated output rows are valid but repeated recipe ids are not", () => {
    const recipe: RecipeDef = { id: "gift", inputs: [], outputs: [{ itemId: "token", count: 1 }, { itemId: "token", count: 2 }] };
    expect(validateRecipeCatalog([recipe])).toEqual([]);
    const issues = validateRecipeCatalog([recipe, { ...recipe, outputs: [] }]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "duplicate-recipe", path: "/1/id", contentId: "gift", referenceId: "gift" });
    expect(issues[0]!.repair).toContain("distinct ids");
  });

  for (const value of [-1, NaN, Infinity, -Infinity]) {
    test(`rejects negative/nonfinite authored quantities and timing: ${String(value)}`, () => {
      const issues = validateRecipeCatalog([{ id: "broken", inputs: [{ itemId: "ore", count: value }], outputs: [{ itemId: "seal", count: value }], seconds: value, stationRange: value }]);
      expect(issues.map(({ code, path }) => ({ code, path }))).toEqual([
        { code: "invalid-count", path: "/0/inputs/0/count" },
        { code: "invalid-count", path: "/0/outputs/0/count" },
        { code: "invalid-number", path: "/0/seconds" },
        { code: "invalid-number", path: "/0/stationRange" },
      ]);
      expect(issues.every((issue) => issue.severity === "error" && issue.contentId === "broken" && issue.repair.length > 0)).toBe(true);
    });
  }

  test("validation preserves frozen authored data and deterministic reference order", () => {
    const recipe = Object.freeze({ id: "frozen", inputs: Object.freeze([Object.freeze({ itemId: "ore", count: 1 })]), outputs: Object.freeze([Object.freeze({ itemId: "seal", count: 1 })]), station: "forge", requires: Object.freeze(["smith"]) });
    const catalog = Object.freeze([recipe]);
    const before = JSON.stringify(catalog);
    const references: string[] = [];
    const options = { hasReference: (kind: string, id: string) => { references.push(`${kind}:${id}`); return false; } };
    const first = validateRecipeCatalog(catalog, options);
    expect(references).toEqual(["item:ore", "item:seal", "station:forge", "unlock:smith"]);
    references.length = 0;
    expect(validateRecipeCatalog(catalog, options)).toEqual(first);
    expect(references).toEqual(["item:ore", "item:seal", "station:forge", "unlock:smith"]);
    first[0]!.path = "changed";
    expect(validateRecipeCatalog(catalog, options)[0]!.path).toBe("/0/inputs/0/itemId");
    expect(JSON.stringify(catalog)).toBe(before);
  });
});
