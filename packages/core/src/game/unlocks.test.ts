import { describe, expect, test } from "bun:test";

import { createUnlocks } from "./unlocks";

describe("unlocks", () => {
  test("has is false until granted", () => {
    const unlocks = createUnlocks();
    expect(unlocks.has("alice", "recipe_bread")).toBe(false);
    unlocks.grant("alice", "recipe_bread");
    expect(unlocks.has("alice", "recipe_bread")).toBe(true);
  });

  test("grants are isolated per user", () => {
    const unlocks = createUnlocks();
    unlocks.grant("alice", "recipe_bread");
    expect(unlocks.has("bob", "recipe_bread")).toBe(false);
  });

  test("list returns every unlock granted to a user", () => {
    const unlocks = createUnlocks();
    unlocks.grant("alice", "recipe_bread");
    unlocks.grant("alice", "recipe_stew");
    expect(unlocks.list("alice").sort()).toEqual(["recipe_bread", "recipe_stew"]);
    expect(unlocks.list("bob")).toEqual([]);
  });

  test("tree returns defs belonging to a category", () => {
    const unlocks = createUnlocks([
      { id: "recipe_bread", category: "cooking" },
      { id: "recipe_stew", category: "cooking" },
      { id: "blueprint_forge", category: "crafting" },
    ]);
    expect(unlocks.tree("cooking")).toEqual([
      { id: "recipe_bread", category: "cooking" },
      { id: "recipe_stew", category: "cooking" },
    ]);
    expect(unlocks.tree("unknown")).toEqual([]);
  });

  test("snapshot and hydrate round-trip a user's granted ids", () => {
    const unlocks = createUnlocks();
    unlocks.grant("alice", "recipe_bread");
    const snapshot = unlocks.snapshot("alice");
    expect(snapshot).toEqual(["recipe_bread"]);

    const restored = createUnlocks();
    restored.hydrate("alice", snapshot);
    expect(restored.has("alice", "recipe_bread")).toBe(true);
  });

  test("hydrate replaces any previously granted ids for that user", () => {
    const unlocks = createUnlocks();
    unlocks.grant("alice", "recipe_bread");
    unlocks.hydrate("alice", ["recipe_stew"]);
    expect(unlocks.has("alice", "recipe_bread")).toBe(false);
    expect(unlocks.has("alice", "recipe_stew")).toBe(true);
  });
});
