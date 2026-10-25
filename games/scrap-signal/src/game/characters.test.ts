import { afterEach, describe, expect, test } from "bun:test";
import {
  bonus,
  CHARACTERS,
  characterById,
  pickCharacter,
  resetCharacterState,
  talentTree,
} from "./characters";

afterEach(() => resetCharacterState());

describe("characters", () => {
  test("three reactor hunters, each with three unique branch themes", () => {
    expect(CHARACTERS.length).toBe(3);
    const allBranchIds = CHARACTERS.flatMap((character) => character.branches.map((branch) => branch.id));
    expect(new Set(allBranchIds).size).toBe(9);
    for (const character of CHARACTERS) {
      expect(character.branches.length).toBe(3);
      for (const branch of character.branches) {
        const nodes = character.nodes.filter((node) => node.branch === branch.id);
        expect(nodes.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test("capstones gate behind 10 points in branch", () => {
    pickCharacter("gunk");
    const tree = talentTree()!;
    tree.grantPoints(11);
    expect(tree.canAllocate("gunk_sustained_burst").ok).toBe(false);
    for (let index = 0; index < 5; index += 1) expect(tree.allocate("gunk_hot_chamber").ok).toBe(true);
    for (let index = 0; index < 5; index += 1) expect(tree.allocate("gunk_heavy_feed").ok).toBe(true);
    expect(tree.canAllocate("gunk_sustained_burst").ok).toBe(true);
    expect(tree.allocate("gunk_sustained_burst").ok).toBe(true);
    expect(bonus("fireRate")).toBeCloseTo(0.06 * 5 + 0.25, 5);
    expect(bonus("gunDamage")).toBeCloseTo(0.05 * 5 + 0.1, 5);
  });

  test("bonus reads zero with no character picked", () => {
    expect(bonus("gunDamage")).toBe(0);
  });

  test("nyx's elemental theme resolves elemental bonuses", () => {
    pickCharacter("nyx");
    const tree = talentTree()!;
    tree.grantPoints(5);
    for (let index = 0; index < 5; index += 1) tree.allocate("nyx_charge_seeding");
    expect(bonus("elementChance")).toBeCloseTo(0.4, 5);
  });

  test("every character id resolves", () => {
    for (const character of CHARACTERS) expect(characterById(character.id)?.id).toBe(character.id);
  });
});
