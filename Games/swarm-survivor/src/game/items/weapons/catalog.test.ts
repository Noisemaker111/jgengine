import { describe, expect, test } from "bun:test";

import {
  MAX_WEAPON_LEVEL,
  WEAPON_IDS,
  quakeRadius,
  rotorBladeCount,
  rotorRadius,
  weaponCooldownMs,
  weaponDamage,
} from "./catalog";

describe("swarm-survivor weapon curves", () => {
  test("damage rises with every weapon level", () => {
    for (const id of WEAPON_IDS) {
      let previous = weaponDamage(id, 1);
      for (let level = 2; level <= MAX_WEAPON_LEVEL; level += 1) {
        const damage = weaponDamage(id, level);
        expect(damage).toBeGreaterThan(previous);
        previous = damage;
      }
    }
  });

  test("cooldown shrinks with level but never below its floor", () => {
    for (const id of WEAPON_IDS) {
      let previous = weaponCooldownMs(id, 1);
      for (let level = 2; level <= MAX_WEAPON_LEVEL; level += 1) {
        const cooldown = weaponCooldownMs(id, level);
        expect(cooldown).toBeLessThanOrEqual(previous);
        expect(cooldown).toBeGreaterThan(0);
        previous = cooldown;
      }
    }
  });

  test("rotor blade count is monotonic and capped at six", () => {
    let previous = rotorBladeCount(1);
    for (let level = 2; level <= MAX_WEAPON_LEVEL; level += 1) {
      const count = rotorBladeCount(level);
      expect(count).toBeGreaterThanOrEqual(previous);
      expect(count).toBeLessThanOrEqual(6);
      previous = count;
    }
  });

  test("rotor and quake radii grow with level", () => {
    expect(rotorRadius(MAX_WEAPON_LEVEL)).toBeGreaterThan(rotorRadius(1));
    expect(quakeRadius(MAX_WEAPON_LEVEL)).toBeGreaterThan(quakeRadius(1));
  });
});
