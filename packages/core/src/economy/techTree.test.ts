import { describe, expect, test } from "bun:test";

import {
  availableTech,
  canUnlockTech,
  createTechTree,
  grantTech,
  techPrerequisitesMet,
  unlockedRecipes,
  type TechNodeDef,
} from "./techTree";

const defs: TechNodeDef[] = [
  { id: "tech_basics", category: "survival", recipe: "recipe_campfire" },
  { id: "tech_smithing", category: "crafting", requires: ["tech_basics"], recipe: "recipe_blade", cost: { research: 10 } },
  { id: "tech_metallurgy", category: "crafting", requires: ["tech_smithing"], recipe: "recipe_plate", grants: ["perm_hot_forge"] },
];

describe("tech tree (pure)", () => {
  test("prerequisites gate a node until its parents are granted", () => {
    expect(techPrerequisitesMet([], defs[1]!)).toBe(false);
    expect(techPrerequisitesMet(["tech_basics"], defs[1]!)).toBe(true);
  });

  test("canUnlockTech reports missing prerequisites", () => {
    const check = canUnlockTech(defs, [], "tech_smithing");
    expect(check.ok).toBe(false);
    if (!check.ok && check.reason === "missing-prerequisites") expect(check.missing).toEqual(["tech_basics"]);
  });

  test("available surfaces only the reachable frontier", () => {
    expect(availableTech(defs, []).map((n) => n.id)).toEqual(["tech_basics"]);
    expect(availableTech(defs, ["tech_basics"]).map((n) => n.id)).toEqual(["tech_smithing"]);
  });

  test("granting a node adds its id and extra grants", () => {
    const state = grantTech(["tech_basics", "tech_smithing"], defs[2]!);
    expect(state).toContain("tech_metallurgy");
    expect(state).toContain("perm_hot_forge");
  });

  test("unlockedRecipes returns recipe payloads of granted nodes", () => {
    expect(unlockedRecipes(defs, ["tech_basics"])).toEqual(["recipe_campfire"]);
    expect(unlockedRecipes(defs, ["tech_basics", "tech_smithing"])).toEqual(["recipe_campfire", "recipe_blade"]);
  });
});

describe("tech tree (stateful, per-user, built on unlocks)", () => {
  test("unlock is refused until prerequisites are met, then succeeds", () => {
    const tree = createTechTree(defs);
    const blocked = tree.unlock("alice", "tech_smithing");
    expect(blocked.ok).toBe(false);

    expect(tree.unlock("alice", "tech_basics").ok).toBe(true);
    expect(tree.unlock("alice", "tech_smithing").ok).toBe(true);
    expect(tree.has("alice", "tech_smithing")).toBe(true);
  });

  test("a node payload unlocks its recipe for the player", () => {
    const tree = createTechTree(defs);
    tree.unlock("bob", "tech_basics");
    expect(tree.recipes("bob")).toEqual(["recipe_campfire"]);
    expect(tree.available("bob").map((n) => n.id)).toEqual(["tech_smithing"]);
  });

  test("grants flow into the underlying flat unlock set", () => {
    const tree = createTechTree(defs);
    tree.unlock("cara", "tech_basics");
    tree.unlock("cara", "tech_smithing");
    tree.unlock("cara", "tech_metallurgy");
    expect(tree.has("cara", "perm_hot_forge")).toBe(true);
  });

  test("tree filters nodes by category and stays isolated per user", () => {
    const tree = createTechTree(defs);
    expect(tree.tree("crafting").map((n) => n.id)).toEqual(["tech_smithing", "tech_metallurgy"]);
    tree.unlock("dave", "tech_basics");
    expect(tree.has("erin", "tech_basics")).toBe(false);
  });
});
