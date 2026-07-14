import { describe, expect, test } from "bun:test";
import { RARITY_ORDER, RARITY_TIERS, WEAPON_BASES, weaponById, weapons } from "./catalog";

describe("weapon catalog", () => {
  test("generates every family at every rarity", () => {
    expect(weapons.length).toBe(WEAPON_BASES.length * RARITY_TIERS.length);
    for (const base of WEAPON_BASES) {
      for (const tier of RARITY_TIERS) {
        expect(weaponById(`${base.family}_${tier.id}`)).toBeDefined();
      }
    }
  });

  test("ids are unique", () => {
    const ids = new Set(weapons.map((weapon) => weapon.id));
    expect(ids.size).toBe(weapons.length);
  });

  test("damage rises and spread falls with rarity within a family", () => {
    for (const base of WEAPON_BASES) {
      for (let i = 1; i < RARITY_ORDER.length; i += 1) {
        const lower = weaponById(`${base.family}_${RARITY_ORDER[i - 1]}`)!;
        const higher = weaponById(`${base.family}_${RARITY_ORDER[i]}`)!;
        expect(higher.weapon.damage).toBeGreaterThan(lower.weapon.damage);
        expect(higher.weapon.spread).toBeLessThanOrEqual(lower.weapon.spread);
        expect(higher.weapon.fireIntervalMs).toBeLessThanOrEqual(lower.weapon.fireIntervalMs);
      }
    }
  });

  test("legendary names are unique epithets", () => {
    const legendaries = weapons.filter((weapon) => weapon.rarity === "legendary");
    const names = new Set(legendaries.map((weapon) => weapon.name));
    expect(names.size).toBe(WEAPON_BASES.length);
    for (const weapon of legendaries) {
      expect(weapon.name).not.toContain(WEAPON_BASES.find((base) => base.family === weapon.family)!.name);
    }
  });

  test("every weapon fires and costs ammo", () => {
    for (const weapon of weapons) {
      expect(weapon.weapon.fireIntervalMs).toBeGreaterThan(0);
      expect(weapon.ammoPerShot).toBeGreaterThan(0);
      expect(weapon.weapon.critChance).toBeGreaterThanOrEqual(0);
      expect(weapon.weapon.critChance).toBeLessThan(1);
    }
  });

  test("every weapon declares a magazine size and reload delay", () => {
    for (const weapon of weapons) {
      expect(weapon.magazineSize).toBeGreaterThan(0);
      expect(weapon.reloadMs).toBeGreaterThan(0);
      expect(weapon.magazineSize).toBeGreaterThanOrEqual(weapon.ammoPerShot);
    }
  });
});
