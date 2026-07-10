import { describe, expect, test } from "bun:test";
import { content, itemNameById } from "./content";
import { enemies, enemyWeapons } from "./entities/enemies/catalog";
import { player } from "./entities/players/catalog";
import { gearItems } from "./items/gear/catalog";
import { weapons } from "./items/weapons/catalog";
import { coverObjects } from "./objects/catalog";

describe("content.entityById", () => {
  test("reads catalog fields live, not a snapshot baked at import time", () => {
    const originalWalkSpeed = player.walkSpeed;
    try {
      player.walkSpeed = originalWalkSpeed + 1;
      expect(content.entityById?.(player.id)?.movement?.walkSpeed).toBe(originalWalkSpeed + 1);
    } finally {
      player.walkSpeed = originalWalkSpeed;
    }
  });

  test("resolves every enemy with role, drops, and stats", () => {
    for (const enemy of enemies) {
      const entry = content.entityById?.(enemy.id);
      expect(entry).not.toBeNull();
      expect(entry?.role).toBe("enemy");
      expect(entry?.onDeath).toBeDefined();
      expect(entry?.stats?.health?.max).toBeGreaterThan(0);
    }
  });

  test("player carries ammo pool stats", () => {
    const entry = content.entityById?.(player.id);
    for (const pool of ["ammo_light", "ammo_heavy", "ammo_shell", "ammo_energy"]) {
      expect(entry?.stats?.[pool]?.max).toBeGreaterThan(0);
    }
  });
});

describe("content.itemById", () => {
  test("resolves every weapon with use handler, rarity, and stats", () => {
    for (const weapon of weapons) {
      const entry = content.itemById?.(weapon.id);
      expect(entry?.use).toBe("fireGun");
      expect(entry?.rarity).toBe(weapon.rarity);
      expect(entry?.weapon?.damage).toBe(weapon.weapon.damage);
    }
  });

  test("resolves gear and enemy bolts", () => {
    for (const item of gearItems) {
      expect(content.itemById?.(item.id)).not.toBeNull();
      expect(itemNameById(item.id)).toBe(item.name);
    }
    for (const bolt of enemyWeapons) {
      expect(content.itemById?.(bolt.id)?.weapon?.damage).toBeGreaterThan(0);
    }
  });
});

describe("content.objectById", () => {
  test("resolves every cover object", () => {
    for (const object of coverObjects) {
      expect(content.objectById?.(object.id)).not.toBeNull();
    }
  });
});
