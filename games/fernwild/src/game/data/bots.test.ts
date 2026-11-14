import { describe, expect, test } from "bun:test";

import { chargeDrain, GLITCHES, HOSTILE, packBonus, QUIRKS, revertChance, rollGlitch, rollQuirk, stormAt, stormNight, targetScore, temperamentConfig, traitMultiplier, type TargetFacts } from "./bots";

const facts = (over: Partial<TargetFacts> = {}): TargetFacts => ({ loud: 0, bright: 0, rich: 0, hurt: 0, machine: false, attacker: false, size: 0, ...over });

describe("targeting rules", () => {
  test("a bot prefers what its first rule cares about over its second", () => {
    const rules = ["weakest", "loudest"] as const;
    expect(targetScore(rules, facts({ hurt: 0.8 }))).toBeGreaterThan(targetScore(rules, facts({ loud: 0.8 })));
    expect(targetScore(["machines"], facts({ machine: true }))).toBeGreaterThan(targetScore(["machines"], facts()));
    expect(targetScore([], facts({ loud: 1, bright: 1 }))).toBe(0);
  });

  test("a torch at night draws a light-seeker; cargo draws a thief", () => {
    expect(targetScore(["brightest"], facts({ bright: 1 }))).toBe(1);
    expect(targetScore(["richest"], facts({ rich: 0.5 }))).toBe(0.5);
  });
});

describe("temperaments", () => {
  test("the seven temperaments tune the engine's three", () => {
    expect(temperamentConfig("skittish").kind).toBe("passive");
    expect(temperamentConfig("pack").kind).toBe("predator");
    expect(temperamentConfig("ambush")).toMatchObject({ kind: "territorial", territoryRadius: 4 });
    expect(temperamentConfig("retaliator")).toMatchObject({ kind: "territorial", territoryRadius: 0 });
    expect(HOSTILE.has("ambush")).toBe(true);
    expect(HOSTILE.has("retaliator")).toBe(false);
  });

  test("packmates stack the pack buff up to its cap", () => {
    const pack = { radius: 10, per: 0.2, max: 3 };
    expect(packBonus(pack, 0)).toBe(1);
    expect(packBonus(pack, 2)).toBeCloseTo(1.4);
    expect(packBonus(pack, 9)).toBeCloseTo(1.6);
    expect(packBonus(undefined, 5)).toBe(1);
  });
});

describe("quirks and glitches", () => {
  test("a clean upload leaves no quirk; a sloppy one usually does", () => {
    expect(rollQuirk(0.95, () => 0)).toBeNull();
    expect(QUIRKS.map((q) => q.id)).toContain(rollQuirk(0.3, () => 0.1)!);
  });

  test("forging rolls a glitch only when a mutation lands, good bad or weird", () => {
    expect(rollGlitch(0, () => 0)).toBeNull();
    const kinds = new Set(GLITCHES.map((g) => g.kind));
    expect([...kinds].sort()).toEqual(["bad", "good", "weird"]);
    expect(GLITCHES.map((g) => g.id)).toContain(rollGlitch(1, () => 0.99)!);
  });

  test("traits multiply stats", () => {
    expect(traitMultiplier(["glass_jaw", "reinforced_frame"], "health")).toBeCloseTo(0.85 * 1.2);
    expect(traitMultiplier([], "speed")).toBe(1);
  });
});

describe("charge, rust and storms", () => {
  test("rain rusts and sun overheats an exposed bot; a roof spares it", () => {
    expect(chargeDrain({ wet: true, covered: false, temperature: 20 })).toEqual({ multiplier: 1.6, cause: "rust" });
    expect(chargeDrain({ wet: false, covered: false, temperature: 35 }).cause).toBe("heat");
    expect(chargeDrain({ wet: true, covered: true, temperature: 40 })).toEqual({ multiplier: 1, cause: null });
  });

  test("storms come on some nights only, dusk to dawn", () => {
    const nights = Array.from({ length: 30 }, (_, i) => stormNight(i + 1));
    expect(nights.some(Boolean)).toBe(true);
    expect(nights.every(Boolean)).toBe(false);
    const night = nights.findIndex(Boolean) + 1;
    expect(stormAt(night - 1 + 0.9)).toBe(true);
    expect(stormAt(night + 0.1)).toBe(true);
    expect(stormAt(night + 0.5)).toBe(false);
  });

  test("devoted bots never revert; loose wiring doubles the risk", () => {
    expect(revertChance(["devoted"])).toBe(0);
    expect(revertChance(["loose_wiring"])).toBeCloseTo(revertChance([]) * 2);
  });
});
