import { describe, expect, test } from "bun:test";
import { lootTables } from "./loot-tables";
import { enemies, enemyById, enemyWeapons } from "./catalog";

describe("enemy catalog", () => {
  test("ships 14 enemy types across 4 families plus bosses", () => {
    expect(enemies.length).toBe(14);
    const families = new Set(enemies.map((enemy) => enemy.family));
    expect(families.size).toBe(5);
  });

  test("rank scaling raises health, xp, and score", () => {
    for (const family of ["drone", "skitter", "husk", "spitter"]) {
      const grunt = enemyById(`${family}_grunt`)!;
      const veteran = enemyById(`${family}_veteran`)!;
      const elite = enemyById(`${family}_elite`)!;
      expect(veteran.stats.health!.max).toBeGreaterThan(grunt.stats.health!.max);
      expect(elite.stats.health!.max).toBeGreaterThan(veteran.stats.health!.max);
      expect(elite.xp).toBeGreaterThan(grunt.xp);
      expect(elite.score).toBeGreaterThan(grunt.score);
    }
  });

  test("every drop table reference resolves", () => {
    const tableIds = new Set(lootTables.map((table) => table.id));
    for (const enemy of enemies) {
      const drops = enemy.onDeath.drops;
      expect(drops).toBeDefined();
      for (const drop of Array.isArray(drops) ? drops : []) {
        expect(tableIds.has(drop.table)).toBe(true);
      }
    }
  });

  test("ranged enemies have a matching bolt item", () => {
    const boltIds = new Set(enemyWeapons.map((bolt) => bolt.id));
    for (const enemy of enemies) {
      if (enemy.attack.kind === "ranged") {
        expect(boltIds.has(enemy.attack.itemId)).toBe(true);
      }
    }
  });

  test("world drops are enabled on every enemy", () => {
    for (const enemy of enemies) {
      expect(enemy.onDeath.dropMode).toBe("world");
    }
  });
});
