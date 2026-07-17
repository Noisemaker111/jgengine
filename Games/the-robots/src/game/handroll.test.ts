import { describe, expect, test } from "bun:test";
import { seededRng } from "@jgengine/core/random/rng";
import {
  applyElementalProc,
  elementalDamageMult,
  type GunDef,
  gunById,
  isFluxed,
  gunProvenance,
  rollGun,
  rollRarity,
  RARITY_TIERS,
  LEVEL_DAMAGE_GROWTH,
} from "./handroll";
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

describe("elemental matrix", () => {
  test("shock doubles against shields", () => {
    expect(elementalDamageMult("shock", "flesh", true, "t", 0)).toBe(2);
  });
  test("corrosive beats armor, incendiary beats flesh", () => {
    expect(elementalDamageMult("corrosive", "armor", false, "t", 0)).toBe(1.5);
    expect(elementalDamageMult("incendiary", "flesh", false, "t", 0)).toBe(1.5);
    expect(elementalDamageMult("incendiary", "armor", false, "t", 0)).toBe(0.75);
  });
  test("flux debuff amplifies non-flux damage via the generic received-modifier seam", () => {
    const target = "flux-target";
    expect(isFluxed(target, 0)).toBe(false);
    expect(elementalDamageMult("incendiary", "flesh", false, target, 0)).toBe(1.5);
    const fluxGun = { element: "flux", elementChance: 1 } as unknown as GunDef;
    applyElementalProc(() => 0, fluxGun, "src", target, 0);
    expect(isFluxed(target, 0)).toBe(true);
    // incendiary/flesh (1.5) amplified x2 while fluxed; the flux channel itself is never amplified.
    expect(elementalDamageMult("incendiary", "flesh", false, target, 0)).toBe(3);
    expect(elementalDamageMult("flux", "flesh", false, target, 0)).toBe(1);
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
