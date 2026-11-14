import { describe, expect, test } from "bun:test";

import { COMBATANTS, combatantDef, isHostile } from "./catalog";

describe("Lawn Order roster", () => {
  test("has a keep for each faction", () => {
    expect(combatantDef("keep_player")?.faction).toBe("player");
    expect(combatantDef("keep_enemy")?.faction).toBe("enemy");
  });

  test("buildings are immobile; a Acid Mound is the only armed structure; units fight and move", () => {
    for (const def of Object.values(COMBATANTS)) {
      if (def.kind === "building") {
        expect(def.walkSpeed).toBe(0);
        if (def.id === "acid_mound") expect(def.damage).toBeGreaterThan(0);
        else expect(def.damage).toBe(0);
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
    expect(combatantDef("raider")?.bounty).toBeGreaterThan(0);
    expect(combatantDef("soldier")?.bounty).toBe(0);
  });
});
