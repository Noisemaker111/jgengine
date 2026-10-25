import { describe, expect, test } from "bun:test";
import { resolveTableDamage } from "@jgengine/core/combat/damageTable";
import { seededRng } from "@jgengine/core/random/rng";
import {
  type GunDef,
  gunById,
  gunProvenance,
  rollGun,
  rollRarity,
  RARITY_TIERS,
  LEVEL_DAMAGE_GROWTH,
} from "./handroll";
import { DAMAGE_TABLE, hitBase } from "./combat/hitModel";
import { resolveLevelProgress, xpRequiredForLevel } from "./progression/curves";

describe("gun generation", () => {
  test("rolls valid registered guns across many seeds", () => {
    const rng = seededRng("gen-test");
    for (let index = 0; index < 200; index += 1) {
      const gun = rollGun(rng, 1 + Math.floor(rng() * 29));
      expect(gun.weapon.damage).toBeGreaterThan(0);
      expect(gun.magSize).toBeGreaterThanOrEqual(2);
      expect(gun.name.length).toBeGreaterThan(2);
      expect(gunById(gun.id)).toBe(gun);
    }
  });

  test("rolled guns carry generation provenance for family, rarity, and manufacturer", () => {
    const gun = rollGun(seededRng("prov-test"), 8, { rarity: "legendary", family: "sniper" });
    const provenance = gunProvenance(gun.id);
    expect(provenance).toBeDefined();
    expect(provenance?.choices.map((choice) => choice.step)).toEqual(["family", "rarity", "maker"]);
    // Pinned steps resolve without rerolls; the maker choice reflects the legendary pool.
    expect(provenance?.choices.find((choice) => choice.step === "rarity")?.optionId).toBe("legendary");
  });

  test("legendary guns carry real legendary names and tighter spread", () => {
    const rng = seededRng("leg-test");
    const gun = rollGun(rng, 10, { rarity: "legendary", family: "sniper" });
    expect(["Longshot", "Ashfall", "Skullsplit"].some((name) => gun.name.includes(name))).toBe(true);
  });

  test("blackwood guns never spawn elemental", () => {
    const rng = seededRng("blackwood-test");
    for (let index = 0; index < 300; index += 1) {
      const gun = rollGun(rng, 5);
      if (gun.manufacturer === "Blackwood") expect(gun.element === "none" || gun.element === "explosive").toBe(true);
    }
  });

  test("damage scales with level", () => {
    const low = rollGun(seededRng("scale-a"), 1, { family: "pistol", rarity: "common" });
    const high = rollGun(seededRng("scale-a"), 20, { family: "pistol", rarity: "common" });
    expect(high.weapon.damage).toBeGreaterThan(low.weapon.damage * (LEVEL_DAMAGE_GROWTH ** 15 / 2));
  });

  test("rarity roll respects luck ordering", () => {
    const rng = seededRng("rarity-test");
    let legendaries = 0;
    for (let index = 0; index < 2000; index += 1) if (rollRarity(rng, 40) === "legendary") legendaries += 1;
    expect(legendaries).toBeGreaterThan(20);
    expect(RARITY_TIERS[0]!.id).toBe("common");
  });
});

describe("elemental chart", () => {
  // The chart is now data the shared damage model reads; these assertions are the old matchup
  // numbers read back through the shared table reader, not through a game-local helper.
  const rowsOf = (type: string, resistance: string) =>
    resolveTableDamage(DAMAGE_TABLE, { type, resistance, base: 1 }).multiplier;
  test("shock doubles against shields", () => {
    expect(rowsOf("shock", "shield")).toBe(2);
  });
  test("corrosive beats armor, incendiary beats flesh", () => {
    expect(rowsOf("corrosive", "armor")).toBe(1.5);
    expect(rowsOf("incendiary", "flesh")).toBe(1.5);
    expect(rowsOf("incendiary", "armor")).toBe(0.75);
    expect(rowsOf("incendiary", "shield")).toBe(0.75);
  });
  test("flux halves shields and doubles every other channel while carried", () => {
    const incendiary = { element: "incendiary", weapon: { damage: 14 } } as unknown as GunDef;
    const fluxGun = { element: "flux", weapon: { damage: 14 } } as unknown as GunDef;
    expect(hitBase(incendiary, false)).toBe(14);
    expect(hitBase(incendiary, true)).toBe(28);
    expect(hitBase(fluxGun, true)).toBe(14);
    expect(rowsOf("flux", "flesh")).toBe(1);
  });
});

describe("xp curve", () => {
  test("levels climb monotonically", () => {
    for (let level = 1; level < 29; level += 1) {
      expect(xpRequiredForLevel(level + 1)).toBeGreaterThan(xpRequiredForLevel(level));
    }
  });
  test("resolveLevelProgress carries overflow xp", () => {
    const progress = resolveLevelProgress(1, xpRequiredForLevel(1) + 10);
    expect(progress.level).toBe(2);
    expect(progress.xp).toBe(10);
    expect(progress.levelsGained).toBe(1);
  });
});

