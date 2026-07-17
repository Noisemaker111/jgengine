import { describe, expect, test } from "bun:test";

import { COMBATANTS, combatantDef, isHostile } from "./catalog";

describe("Ironhold roster", () => {
  test("has a keep for each faction", () => {
    expect(combatantDef("keep_player")?.faction).toBe("player");
    expect(combatantDef("keep_enemy")?.faction).toBe("enemy");
  });

  test("buildings are passive and immobile; units fight and move", () => {
    for (const def of Object.values(COMBATANTS)) {
      if (def.kind === "building") {
        expect(def.walkSpeed).toBe(0);
        expect(def.damage).toBe(0);
      } else {
        expect(def.walkSpeed).toBeGreaterThan(0);
        expect(def.damage).toBeGreaterThan(0);
        expect(def.attackRange).toBeGreaterThan(0);
      }
    }
  });

  test("only opposing factions are hostile", () => {
    expect(isHostile("player", "enemy")).toBe(true);
    expect(isHostile("enemy", "player")).toBe(true);
    expect(isHostile("player", "player")).toBe(false);
  });

  test("enemy units award bounty, player units do not", () => {
    expect(combatantDef("grunt")?.bounty).toBeGreaterThan(0);
    expect(combatantDef("footman")?.bounty).toBe(0);
  });
});
