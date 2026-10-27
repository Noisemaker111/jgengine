import { describe, expect, test } from "bun:test";
import { ZONES } from "../../world/zones";
import { enemyById } from "./catalog";
import { ENEMY_VARIANTS } from "./variants";

describe("scrap-signal local breeds", () => {
  test("every breed is a real enemy built from its base", () => {
    for (const variant of ENEMY_VARIANTS) {
      const def = enemyById(variant.id);
      const base = enemyById(variant.base);
      if (def === undefined || base === undefined) throw new Error(`${variant.id}: missing from the catalog`);
      expect(def.look).toBe(variant.base);
      expect(def.stats["health"]?.max).toBe(Math.round((base.stats["health"]?.max ?? 0) * variant.health));
      expect(def.xp).toBeGreaterThan(base.xp);
      if (variant.shield !== undefined) expect(def.stats["shield"]?.max).toBe(variant.shield);
      expect(def.plate).toBeDefined();
    }
  });

  test("every breed lives in the zone it is written for, and only there", () => {
    for (const variant of ENEMY_VARIANTS) {
      const homes = ZONES.filter((zone) => zone.clusters.some((cluster) => cluster.catalogId === variant.id));
      expect(homes.map((zone) => zone.id), variant.id).toEqual([variant.zone]);
    }
  });

  test("breed ids are unique and never shadow a base enemy", () => {
    const ids = ENEMY_VARIANTS.map((variant) => variant.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const variant of ENEMY_VARIANTS) expect(enemyById(variant.id)?.look).toBe(variant.base);
  });
});
