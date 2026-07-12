import { describe, expect, test } from "bun:test";
import { seededRng } from "@jgengine/core/random/rng";

import { mobById } from "../entities/enemies/catalog";
import { itemDefById } from "../items/catalog";
import { rollWorldBossLoot, WORLD_BOSS_MOB_ID } from "./worldBoss";

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const GEAR = new Set([
  "crownforged_gauntlets",
  "nighttalon_grips",
  "soulflame_gloves",
  "stormcallers_handguards",
  "crownforged_girdle",
  "nighttalon_waistband",
  "soulflame_cord",
  "stormcallers_waistguard",
]);

describe("world boss data", () => {
  test("Thunzharr is system-spawned with mechanics, not part of the boot roster", () => {
    const boss = mobById(WORLD_BOSS_MOB_ID);
    expect(boss).not.toBeNull();
    expect(boss!.count).toBe(0);
    expect(boss!.boss).toBe(true);
    expect(boss!.abilities?.length).toBe(3);
    expect(boss!.mechanics?.enrage).toBeDefined();
    expect(boss!.mechanics?.summons?.mobId).toBe("thunzharr_stormling");
  });

  test("the summoned stormling is not part of the boot roster", () => {
    expect(mobById("thunzharr_stormling")?.count).toBe(0);
  });

  test("every world-boss drop item resolves", () => {
    for (const drop of mobById(WORLD_BOSS_MOB_ID)!.drops) {
      if (drop.itemId === undefined) continue;
      expect(itemDefById(drop.itemId), `unknown drop "${drop.itemId}"`).not.toBeNull();
    }
  });
});

describe("world boss loot", () => {
  test("the storm shard is always granted", () => {
    const drops = rollWorldBossLoot(seq([0.99]));
    expect(drops[0]?.item).toBe("inert_storm_shard");
  });

  test("a winning glove roll yields exactly one gloves-slot piece", () => {
    const drops = rollWorldBossLoot(seq([0.1, 0.5]));
    expect(drops).toHaveLength(2);
    expect(itemDefById(drops[1].item as string)?.slot).toBe("gloves");
  });

  test("a missed glove roll can still yield a belt", () => {
    const drops = rollWorldBossLoot(seq([0.5, 0.1, 0.5]));
    expect(drops).toHaveLength(2);
    expect(itemDefById(drops[1].item as string)?.slot).toBe("waist");
  });

  test("a full miss yields only the shard", () => {
    const drops = rollWorldBossLoot(seq([0.99, 0.99]));
    expect(drops).toHaveLength(1);
  });

  test("gear drops are always tier-2 set pieces and never more than one", () => {
    const rng = seededRng("worldboss-loot-test");
    for (let i = 0; i < 400; i += 1) {
      const gear = rollWorldBossLoot(rng).filter((drop) => drop.item !== "inert_storm_shard");
      expect(gear.length).toBeLessThanOrEqual(1);
      for (const drop of gear) expect(GEAR.has(drop.item as string)).toBe(true);
    }
  });
});
