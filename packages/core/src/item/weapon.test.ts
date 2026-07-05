import { describe, expect, test } from "bun:test";
import { createWeaponStats, getWeaponStat } from "@jgengine/core/item/weapon";

describe("item.weapon", () => {
  test("getWeaponStat reads a top-level numeric stat", () => {
    expect(getWeaponStat({ weapon: { damage: 24 } }, "damage")).toBe(24);
  });

  test("getWeaponStat reads a dotted path into a nested object", () => {
    const entry = { weapon: { explosion: { radius: 6 }, projectile: { mass: 0.4 } } };
    expect(getWeaponStat(entry, "explosion.radius")).toBe(6);
    expect(getWeaponStat(entry, "projectile.mass")).toBe(0.4);
  });

  test("getWeaponStat returns null for a non-numeric leaf", () => {
    expect(getWeaponStat({ weapon: { type: "pistol" } }, "type")).toBeNull();
  });

  test("getWeaponStat returns null for a missing path", () => {
    expect(getWeaponStat({ weapon: { damage: 24 } }, "explosion.radius")).toBeNull();
  });

  test("getWeaponStat returns null when the entry has no weapon field", () => {
    expect(getWeaponStat({}, "damage")).toBeNull();
    expect(getWeaponStat(null, "damage")).toBeNull();
    expect(getWeaponStat(undefined, "damage")).toBeNull();
  });

  test("createWeaponStats resolves the entry through the injected catalog lookup", () => {
    const stats = createWeaponStats((itemId) =>
      itemId === "pistol_sidearm" ? { weapon: { damage: 42, pellets: 1 } } : null,
    );
    expect(stats.getStat("pistol_sidearm", "damage")).toBe(42);
    expect(stats.getStat("unknown", "damage")).toBeNull();
  });
});
