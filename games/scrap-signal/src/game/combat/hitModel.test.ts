import { beforeEach, describe, expect, test } from "bun:test";
import { createDamageRuntime, UnknownTargetProfileError } from "@jgengine/core/combat/damageRuntime";
import { readDamageTable } from "@jgengine/core/combat/damageTable";
import { formatDamageTable } from "@jgengine/core/combat/damageTable";

import { resetCharacterState } from "../characters";
import type { GunDef, GunElement } from "../handroll/guns";
import { DAMAGE_TABLE, FLUX_STATUS, hitBase, zonesFor } from "./hitModel";

/**
 * The before/after table. `old` is what scrap's own arithmetic landed when this file was written,
 * read from `.scratch/scrap-damage-before.ts` against the then-live `elementalDamageMult` + crit
 * multiply + `Math.round` of the extra: `base + round(base × (mult − 1))`. `now` is the shared damage
 * model's resolution, rounded once. They must be the same number for every pair.
 */
interface Pair {
  label: string;
  element: GunElement;
  damage: number;
  surface: "flesh" | "armor" | "shield";
  critMult: number;
  crit?: boolean;
  old: number;
}

const PAIRS: readonly Pair[] = [
  { label: "incendiary 14 vs flesh", element: "incendiary", damage: 14, surface: "flesh", critMult: 2, old: 21 },
  { label: "incendiary 14 vs flesh, crit", element: "incendiary", damage: 14, surface: "flesh", critMult: 2, crit: true, old: 42 },
  { label: "corrosive 42 vs armor", element: "corrosive", damage: 42, surface: "armor", critMult: 2.5, old: 63 },
  { label: "corrosive 42 vs armor, crit", element: "corrosive", damage: 42, surface: "armor", critMult: 2.5, crit: true, old: 158 },
  { label: "shock 6 vs shield", element: "shock", damage: 6, surface: "shield", critMult: 1.7, old: 12 },
  { label: "incendiary 14 vs armor", element: "incendiary", damage: 14, surface: "armor", critMult: 2, old: 11 },
  { label: "none 5 vs flesh", element: "none", damage: 5, surface: "flesh", critMult: 1.6, old: 5 },
];

function gun(element: GunElement, damage: number, critMult: number, critChance = 0): GunDef {
  return {
    id: `test_${element}_${damage}`,
    kind: "gun",
    name: "Test Gun",
    family: "pistol",
    manufacturer: "Apex",
    rarity: "common",
    element,
    level: 1,
    ammo: "pistol",
    auto: false,
    ammoPerShot: 1,
    magSize: 12,
    reloadMs: 1200,
    elementChance: 0.5,
    elementDps: 5,
    use: "fireGun",
    weapon: { damage, range: 60, spread: 1.4, fireIntervalMs: 260, critChance: critChance, critMult },
  };
}

beforeEach(() => resetCharacterState());

describe("shared damage model reproduces the old hit numbers", () => {
  test("every weapon/resistance pair lands the same integer", () => {
    const after: string[] = [];
    for (const pair of PAIRS) {
      const runtime = createDamageRuntime({
        table: DAMAGE_TABLE,
        zones: zonesFor(gun(pair.element, pair.damage, pair.critMult, pair.crit === true ? 0.3 : 0)),
        rng: () => (pair.crit === true ? 0 : 0.999),
      });
      runtime.registerTarget("t", { resistance: pair.surface });
      const resolution = runtime.hit({ target: "t", type: pair.element, base: pair.damage });
      const landed = Math.round(resolution.damage);
      after.push(`${pair.label}: ${pair.old} -> ${landed}`);
      expect(landed).toBe(pair.old);
    }
    expect(after.length).toBe(PAIRS.length);
  });

  test("a critical hit multiplies the same way the old local crit did", () => {
    const critGun = gun("corrosive", 42, 2.5, 0.3);
    const runtime = createDamageRuntime({
      table: DAMAGE_TABLE,
      zones: zonesFor(critGun),
      rng: () => 0, // always a crit
    });
    runtime.registerTarget("t", { resistance: "armor" });
    const resolution = runtime.hit({ target: "t", type: "corrosive", base: 42 });
    expect(resolution.zone.crit).toBe(true);
    expect(Math.round(resolution.damage)).toBe(158);
  });

  test("flux doubles a non-flux channel and leaves its own alone", () => {
    const runtime = createDamageRuntime({
      table: DAMAGE_TABLE,
      zones: zonesFor(gun("shock", 6, 1.7)),
      statuses: [FLUX_STATUS],
      rng: () => 0,
    });
    runtime.registerTarget("t", { resistance: "shield" });
    expect(hitBase(gun("shock", 6, 1.7), true)).toBe(12);
    expect(runtime.applyStatus("t", "flux").kind).toBe("applied");
    const resolution = runtime.hit({ target: "t", type: "shock", base: 12 });
    expect(Math.round(resolution.damage)).toBe(24);
    expect(runtime.statusesOf("t").map((status) => status.status)).toEqual(["flux"]);
  });

  test("the three shipped weapon/armour pairs keep their old hit and kill time", () => {
    // Golden numbers from the pre-adoption arithmetic (`base + round(base × (mult − 1))`), read off
    // the real catalog guns and enemy profiles. Same integer, same shots, same milliseconds.
    const cases = [
      { gun: gun("incendiary", 14, 2), surface: "armor", hp: 110, intervalMs: 260, magSize: 12, reloadMs: 1200, hit: 11, shots: 10, killMs: 2340 },
      { gun: gun("corrosive", 42, 2.5), surface: "armor", hp: 340, intervalMs: 900, magSize: 5, reloadMs: 2600, hit: 63, shots: 6, killMs: 7100 },
      { gun: gun("shock", 6, 1.7), surface: "shield", hp: 240, intervalMs: 92, magSize: 28, reloadMs: 1600, hit: 12, shots: 20, killMs: 1748 },
    ] as const;
    for (const entry of cases) {
      const runtime = createDamageRuntime({ table: DAMAGE_TABLE, zones: zonesFor(entry.gun), rng: () => 0.999 });
      runtime.registerTarget("t", { resistance: entry.surface });
      const landed = Math.round(runtime.hit({ target: "t", type: entry.gun.element, base: entry.gun.weapon.damage }).damage);
      expect(landed).toBe(entry.hit);
      const shots = Math.ceil(entry.hp / landed);
      const reloads = Math.floor((shots - 1) / entry.magSize);
      expect(shots).toBe(entry.shots);
      expect(Math.round((shots - 1) * entry.intervalMs + reloads * entry.reloadMs)).toBe(entry.killMs);
    }
  });

  test("a hit on an unregistered body is refused, not dealt as its base", () => {
    const runtime = createDamageRuntime({
      table: DAMAGE_TABLE,
      zones: zonesFor(gun("none", 5, 1.6)),
      rng: () => 0.5,
    });
    expect(() => runtime.hit({ target: "ghost", type: "none", base: 5 })).toThrow(UnknownTargetProfileError);
  });

  test("the chart prints as the readable table this change is reviewed from", () => {
    const rows = readDamageTable(DAMAGE_TABLE, {
      base: 10,
      resistances: ["flesh", "armor", "shield"],
      types: ["incendiary", "corrosive", "shock", "flux", "none"],
    });
    const lines = formatDamageTable(rows);
    expect(lines.length).toBe(rows.length);
    expect(lines.join("\n")).toContain("shock");
  });
});

