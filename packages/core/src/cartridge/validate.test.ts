import { describe, expect, test } from "bun:test";

import { leveled, type CartridgeSpec } from "./spec";
import { validateCartridge } from "./validate";

function baseSpec(): CartridgeSpec {
  return {
    player: { kind: "hero", health: 100, walkSpeed: 5 },
    enemies: {
      grunt: { label: "Grunt", health: 10, walkSpeed: 3, xp: 1, contact: { damage: 4, intervalSeconds: 0.5 } },
    },
    combat: { contactRadius: 1 },
    spawning: {
      director: {
        waves: [{ budget: 10, entries: [{ id: "grunt", cost: 1, weight: 1 }] }],
        maxAlive: 10,
        escalationPerSecond: 0,
        maxSpawnsPerTick: 4,
        seed: 1,
      },
      placement: { kind: "ring", radius: 8 },
    },
    weapons: {
      zap: { kind: "projectile", label: "Zap", damage: 5, cooldownMs: 400, maxLevel: 3, range: 10, speed: 15 },
    },
    progression: {
      xp: { kind: "geometric", base: 5, ratio: 1.2, round: "ceil" },
      maxLevel: 8,
      draft: {
        choices: 3,
        upgrades: [
          { id: "zap_up", label: "Zap Up", weight: 1, maxStacks: 2, effect: { kind: "weaponLevel", weapon: "zap" } },
        ],
      },
    },
    xpGems: {
      collectRadius: 0.5,
      pullSpeed: 10,
      rarityThresholds: [[5, "rare"]],
      defaultRarity: "common",
    },
    rules: { win: { kind: "survive", seconds: 60 }, lose: { kind: "playerDeath" } },
    fields: { magnetRadius: 3 },
  };
}

describe("leveled", () => {
  test("resolves plain numbers, linear ramps with clamps, and tables", () => {
    expect(leveled(7, 5)).toBe(7);
    expect(leveled({ base: 10, perLevel: 2 }, 3)).toBe(14);
    expect(leveled({ base: 900, perLevel: -70, min: 320 }, 40)).toBe(320);
    expect(leveled({ base: 1, perLevel: 1, max: 4 }, 9)).toBe(4);
    expect(leveled({ table: [2, 2, 3, 3] }, 1)).toBe(2);
    expect(leveled({ table: [2, 2, 3, 3] }, 3)).toBe(3);
    expect(leveled({ table: [2, 2, 3, 3] }, 99)).toBe(3);
  });
});

describe("validateCartridge", () => {
  test("accepts a coherent spec", () => {
    expect(validateCartridge(baseSpec())).toEqual([]);
  });

  test("flags unknown spawn entries, weapons, and fields", () => {
    const spec = baseSpec();
    spec.spawning.director.waves[0]!.entries.push({ id: "ghost", cost: 1, weight: 1 });
    spec.progression.draft.upgrades = [
      ...spec.progression.draft.upgrades,
      { id: "bad_weapon", label: "Bad", weight: 1, maxStacks: 1, effect: { kind: "weaponLevel", weapon: "nope" } },
      { id: "bad_field", label: "Bad", weight: 1, maxStacks: 1, effect: { kind: "fieldAdd", field: "gravity", amount: 1 } },
    ];
    const problems = validateCartridge(spec);
    expect(problems.some((p) => p.includes('unknown enemy "ghost"'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown weapon "nope"'))).toBe(true);
    expect(problems.some((p) => p.includes('undeclared field "gravity"'))).toBe(true);
  });

  test("flags upgrade stacks exceeding weapon max level and duplicate ids", () => {
    const spec = baseSpec();
    spec.progression.draft.upgrades = [
      { id: "zap_up", label: "Zap Up", weight: 1, maxStacks: 5, effect: { kind: "weaponLevel", weapon: "zap" } },
      { id: "zap_up", label: "Zap Up Again", weight: 1, maxStacks: 1, effect: { kind: "weaponLevel", weapon: "zap" } },
    ];
    const problems = validateCartridge(spec);
    expect(problems.some((p) => p.includes("exceeds weapon"))).toBe(true);
    expect(problems.some((p) => p.includes("duplicate id"))).toBe(true);
  });

  test("flags non-positive tuning and unsorted rarity thresholds", () => {
    const spec = baseSpec();
    spec.enemies["grunt"]!.health = 0;
    spec.xpGems.rarityThresholds = [
      [3, "uncommon"],
      [5, "rare"],
    ];
    spec.rules.win = { kind: "survive", seconds: 0 };
    const problems = validateCartridge(spec);
    expect(problems.some((p) => p.includes('enemy "grunt": health'))).toBe(true);
    expect(problems.some((p) => p.includes("descending"))).toBe(true);
    expect(problems.some((p) => p.includes("win.seconds"))).toBe(true);
  });
});
