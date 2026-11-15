import { describe, expect, test } from "bun:test";
import { seededRng } from "@jgengine/core/random/rng";

import { FAMILY_BASES, junkCard, mergeCost, mergeGuns, mergePlan, MANUFACTURERS, rollGun } from ".";
import {
  derivePersonality,
  isFreeShot,
  bossLine,
  KILL_MILESTONES,
  milestoneLine,
  moodDamageScale,
  moodIntervalScale,
  moodReloadScale,
  PERSONALITIES,
  PERSONALITY_TUNING,
  personalityOf,
  type MoodState,
} from "./personality";

const calm: MoodState = { heldMs: 0, killStacks: 0, magFraction: 1, guilty: false };

describe("weapon personalities", () => {
  test("seven personalities, each with a perk, a quirk and lines for every moment", () => {
    expect(PERSONALITIES.map((entry) => entry.id).sort()).toEqual(["cheerful", "clingy", "competitive", "dramatic", "grumpy", "paranoid", "philosophical"]);
    for (const personality of PERSONALITIES) {
      expect(personality.perk.length).toBeGreaterThan(10);
      expect(personality.quirk.length).toBeGreaterThan(10);
      for (const lines of Object.values(personality.barks)) expect(lines.length).toBeGreaterThan(0);
    }
  });

  test("every rolled weapon has a personality, stable from its id and off the roll stream", () => {
    const a = rollGun(seededRng("persona"), 4);
    const b = rollGun(seededRng("persona"), 4);
    expect(a.personality).toBe(derivePersonality(a));
    expect(personalityOf({ id: a.id }).id).toBe(derivePersonality(a));
    expect({ ...a, id: "", personality: "" }).toEqual({ ...b, id: "", personality: "" });
    const seen = new Set<string>();
    const rng = seededRng("persona-spread");
    for (let index = 0; index < 200; index += 1) seen.add(rollGun(rng, 3).personality ?? "");
    expect(seen.size).toBe(PERSONALITIES.length);
  });

  test("Grumpy hits harder and reloads slower; Cheerful hits softer", () => {
    expect(moodDamageScale("grumpy", calm)).toBeCloseTo(1 + PERSONALITY_TUNING.grumpy.damage, 5);
    expect(moodReloadScale("grumpy")).toBeLessThan(1);
    expect(moodDamageScale("cheerful", calm)).toBeLessThan(1);
  });

  test("Clingy builds with time held up to its cap; a jilted Clingy taxes the others", () => {
    const step = PERSONALITY_TUNING.clingy.stepMs;
    expect(moodDamageScale("clingy", calm)).toBe(1);
    expect(moodDamageScale("clingy", { ...calm, heldMs: step * 3 })).toBeCloseTo(1 + 3 * PERSONALITY_TUNING.clingy.perStep, 5);
    expect(moodDamageScale("clingy", { ...calm, heldMs: step * 1000 })).toBeCloseTo(1 + PERSONALITY_TUNING.clingy.cap, 5);
    expect(moodDamageScale("philosophical", { ...calm, guilty: true })).toBeCloseTo(1 + PERSONALITY_TUNING.clingy.guiltDamage, 5);
  });

  test("Competitive stacks per kill up to its cap; Dramatic saves it for the finale", () => {
    const tuning = PERSONALITY_TUNING.competitive;
    expect(moodDamageScale("competitive", { ...calm, killStacks: 2 })).toBeCloseTo(1 + 2 * tuning.perKill, 5);
    expect(moodDamageScale("competitive", { ...calm, killStacks: 99 })).toBeCloseTo(1 + tuning.maxStacks * tuning.perKill, 5);
    expect(moodDamageScale("dramatic", calm)).toBe(1);
    expect(moodDamageScale("dramatic", { ...calm, magFraction: 0.2 })).toBeCloseTo(1 + PERSONALITY_TUNING.dramatic.finaleDamage, 5);
  });

  test("Philosophical fires slower and every sixth shot is free", () => {
    expect(moodIntervalScale("philosophical")).toBeGreaterThan(1);
    const free = [1, 2, 3, 4, 5, 6, 7, 12].filter((shot) => isFreeShot("philosophical", shot));
    expect(free).toEqual([6, 12]);
    expect(isFreeShot("grumpy", 6)).toBe(false);
  });
});

describe("career kills", () => {
  test("every personality remarks on each milestone, and only there", () => {
    for (const personality of PERSONALITIES) {
      for (const n of KILL_MILESTONES) expect(milestoneLine(personality.id, n)).toContain(String(n));
      expect(milestoneLine(personality.id, 11)).toBeNull();
      expect(bossLine(personality.id, "Mother Router")).toContain("Mother Router");
    }
  });
});

describe("junk cards", () => {
  test("every body and mod reads in words, and an heirloom carries its story", () => {
    expect(FAMILY_BASES).toHaveLength(8);
    expect(MANUFACTURERS).toHaveLength(8);
    const heirloom = rollGun(seededRng("card"), 9, { legendary: "Dust Bunny" });
    const card = junkCard(heirloom);
    expect(card).toMatchObject({ condition: "Heirloom", body: "Vacuum", mod: "Batteries" });
    expect(card.story).toContain("Biscuit");
    const plain = junkCard(rollGun(seededRng("card"), 2, { rarity: "common", family: "extinguisher" }));
    expect(plain).toMatchObject({ condition: "Busted", body: "Fire Extinguisher", story: null });
  });
});

describe("workbench merge", () => {
  test("body and voice from the first, mod from the second; two of a condition step up", () => {
    const body = rollGun(seededRng("m-body"), 5, { family: "launcher", rarity: "uncommon", maker: "Rubber Bands" });
    const mod = rollGun(seededRng("m-mod"), 7, { family: "rifle", rarity: "uncommon", maker: "Extension Cord" });
    const merged = mergeGuns(body, mod);
    expect(merged).toMatchObject({ family: "launcher", manufacturer: "Extension Cord", rarity: "rare", level: 7, personality: personalityOf(body).id });
    expect(mergeCost(mergePlan(body, mod))).toEqual({ cash: 210, cores: 1 });
  });

  test("a merge never makes an heirloom, and the better condition wins otherwise", () => {
    const heirloom = rollGun(seededRng("m-h"), 9, { legendary: "Six-Pack" });
    const busted = rollGun(seededRng("m-b"), 3, { family: "vacuum", rarity: "common", maker: "Duct Tape" });
    expect(mergePlan(busted, heirloom).rarity).toBe("epic");
    const mint = rollGun(seededRng("m-e"), 3, { family: "smg", rarity: "epic", maker: "Batteries" });
    expect(mergePlan(busted, mint).rarity).toBe("epic");
    expect(() => mergeGuns(busted, busted)).toThrow();
  });
});
