import { describe, expect, test } from "bun:test";

import {
  MAX_WEAPON_PELLETS_IN_FLIGHT,
  assertWeaponDefinition,
  weaponDamageAt,
  weaponIntervalMs,
  weaponMaxInFlight,
  type WeaponDefinition,
} from "./weaponDefinition";

const fixture: WeaponDefinition = {
  id: "fixture.definition",
  roundsPerMinute: 600,
  fireMode: "auto",
  delivery: { kind: "hitscan", maxRange: 60 },
  magazine: { capacity: 30, reloadMs: 2_000, reserve: 90 },
  handling: {
    spread: { base: 0.002, perShot: 0.0015, max: 0.012, recoverRate: 0.02, recoverDelay: 0.15 },
    recoil: { pattern: [[0.008, 0], [0.01, 0.002]], recoverRate: 0.6, recoverDelay: 0.12 },
  },
  damage: { type: "kinetic", base: 20 },
  falloff: { start: 10, end: 40, endScale: 0.4 },
  maxInFlight: 8,
};

describe("weapon definitions are plain data", () => {
  test("a full definition survives JSON with no functions", () => {
    expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture);
    expect(() => assertWeaponDefinition(fixture)).not.toThrow();
  });

  test("burst mode needs a burst size", () => {
    expect(() => assertWeaponDefinition({ ...fixture, fireMode: "burst" })).toThrow(/"burst"/);
    expect(() => assertWeaponDefinition({ ...fixture, fireMode: "burst", burst: { count: 0 } })).toThrow(/burst.count/);
    expect(() => assertWeaponDefinition({ ...fixture, fireMode: "burst", burst: { count: 65 } })).toThrow(/burst.count/);
    expect(() => assertWeaponDefinition({ ...fixture, fireMode: "burst", burst: { count: 3 } })).not.toThrow();
  });

  test("nonsense numbers name the field they came from", () => {
    expect(() => assertWeaponDefinition({ ...fixture, id: " " })).toThrow(/id/);
    expect(() => assertWeaponDefinition({ ...fixture, roundsPerMinute: 0 })).toThrow(/roundsPerMinute/);
    expect(() => assertWeaponDefinition({ ...fixture, pellets: 0 })).toThrow(/pellets/);
    expect(() => assertWeaponDefinition({ ...fixture, pellets: 2.5 })).toThrow(/pellets/);
    expect(() => assertWeaponDefinition({ ...fixture, damage: { type: "kinetic", base: 0 } })).toThrow(/damage.base/);
    expect(() => assertWeaponDefinition({ ...fixture, delivery: { kind: "hitscan", maxRange: 0 } })).toThrow(/delivery.maxRange/);
    expect(() => assertWeaponDefinition({ ...fixture, delivery: { kind: "projectile", speed: 0, lifetime: 1 } })).toThrow(/delivery.speed/);
    expect(() => assertWeaponDefinition({ ...fixture, delivery: { kind: "projectile", speed: 30, lifetime: 0 } })).toThrow(/delivery.lifetime/);
    expect(() => assertWeaponDefinition({ ...fixture, magazine: { capacity: 0, reloadMs: 1 } })).toThrow(/magazine.capacity/);
    expect(() => assertWeaponDefinition({ ...fixture, magazine: { capacity: 4, reloadMs: -1 } })).toThrow(/magazine.reloadMs/);
    expect(() => assertWeaponDefinition({ ...fixture, falloff: { start: 40, end: 10, endScale: 0.5 } })).toThrow(/falloff.end/);
    expect(() => assertWeaponDefinition({ ...fixture, falloff: { start: 0, end: 10, endScale: 2 } })).toThrow(/falloff.endScale/);
    expect(() => assertWeaponDefinition({ ...fixture, maxInFlight: 0 })).toThrow(/maxInFlight/);
  });

  test("an unknown delivery kind is rejected at runtime, not just by the type", () => {
    const broken = { ...fixture, delivery: { kind: "beam" } } as unknown as WeaponDefinition;
    expect(() => assertWeaponDefinition(broken)).toThrow(/delivery.kind/);
  });
});

describe("definition math", () => {
  test("rounds per minute becomes an interval in milliseconds", () => {
    expect(weaponIntervalMs({ ...fixture, roundsPerMinute: 600 })).toBeCloseTo(100, 10);
    expect(weaponIntervalMs({ ...fixture, roundsPerMinute: 1200 })).toBeCloseTo(50, 10);
  });

  test("falloff is flat before start, linear between, clamped after end", () => {
    expect(weaponDamageAt(fixture, 0)).toBe(1);
    expect(weaponDamageAt(fixture, 10)).toBe(1);
    expect(weaponDamageAt(fixture, 25)).toBeCloseTo(0.7, 10);
    expect(weaponDamageAt(fixture, 40)).toBeCloseTo(0.4, 10);
    expect(weaponDamageAt(fixture, 200)).toBeCloseTo(0.4, 10);
    expect(weaponDamageAt({ ...fixture, falloff: undefined }, 200)).toBe(1);
  });

  test("the live pellet cap is bounded", () => {
    expect(weaponMaxInFlight(fixture)).toBe(8);
    expect(weaponMaxInFlight({ ...fixture, maxInFlight: undefined })).toBe(32);
    expect(weaponMaxInFlight({ ...fixture, maxInFlight: 10_000 })).toBe(MAX_WEAPON_PELLETS_IN_FLIGHT);
    expect(weaponMaxInFlight({ ...fixture, maxInFlight: 0 })).toBe(1);
  });
});
