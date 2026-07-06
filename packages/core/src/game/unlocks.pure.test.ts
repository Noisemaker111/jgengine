import { describe, expect, test } from "bun:test";

import { createUnlockCatalog, grantUnlock, hasUnlock, unlockTree } from "./unlocks";

describe("pure unlocks tier", () => {
  test("hasUnlock reads a granted-id array", () => {
    expect(hasUnlock(["recipe_bread"], "recipe_bread")).toBe(true);
    expect(hasUnlock(["recipe_bread"], "recipe_stew")).toBe(false);
    expect(hasUnlock([], "recipe_bread")).toBe(false);
  });

  test("grantUnlock appends without mutating the input", () => {
    const before: readonly string[] = ["recipe_bread"];
    const after = grantUnlock(before, "recipe_stew");
    expect(after).toEqual(["recipe_bread", "recipe_stew"]);
    expect(before).toEqual(["recipe_bread"]);
  });

  test("grantUnlock is idempotent for an already-granted id", () => {
    const after = grantUnlock(["recipe_bread"], "recipe_bread");
    expect(after).toEqual(["recipe_bread"]);
  });

  test("unlockTree filters defs by category", () => {
    const defs = [
      { id: "recipe_bread", category: "cooking" },
      { id: "recipe_stew", category: "cooking" },
      { id: "blueprint_forge", category: "crafting" },
    ];
    expect(unlockTree(defs, "cooking")).toEqual([
      { id: "recipe_bread", category: "cooking" },
      { id: "recipe_stew", category: "cooking" },
    ]);
    expect(unlockTree(defs, "unknown")).toEqual([]);
  });

  test("createUnlockCatalog answers has and tree over static defs", () => {
    const catalog = createUnlockCatalog([
      { id: "recipe_bread", category: "cooking" },
      { id: "blueprint_forge", category: "crafting" },
    ]);
    expect(catalog.has("recipe_bread")).toBe(true);
    expect(catalog.has("missing")).toBe(false);
    expect(catalog.tree("crafting")).toEqual([{ id: "blueprint_forge", category: "crafting" }]);
  });
});
