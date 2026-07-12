import { describe, expect, test } from "bun:test";

import { CRIT_MULTIPLIER, armorReduction, fallDamage, mitigate, mobDamage, mobHp, rollWeaponDamage, spellAmount } from "./combat";
import { GROUP_XP_BONUS, MAX_LEVEL, XP_TABLE, groupXpMultiplier, killXp, levelTrack } from "../progression/curves";

describe("armor mitigation (upstream formula)", () => {
  test("caps at 75%", () => {
    expect(armorReduction(1_000_000, 1)).toBe(0.75);
  });

  test("matches armor/(armor + 85·level + 400)", () => {
    expect(armorReduction(485, 1)).toBeCloseTo(485 / (485 + 85 + 400), 10);
    expect(armorReduction(0, 10)).toBe(0);
  });

  test("mitigate never drops below 1", () => {
    expect(mitigate(2, 100_000, 1)).toBe(1);
  });
});

describe("crit multiplier (upstream 1.5x contract)", () => {
  test("is a flat 1.5x, not 2x", () => {
    expect(CRIT_MULTIPLIER).toBe(1.5);
  });
});

describe("xp curve (upstream XP_TABLE)", () => {
  test("level 1→2 costs 400, cap at 20", () => {
    expect(levelTrack.xpForLevel(1)).toBe(400);
    expect(levelTrack.xpForLevel(19)).toBe(XP_TABLE[18]);
    expect(levelTrack.maxLevel).toBe(MAX_LEVEL);
  });

  test("resolve walks multiple levels on a big grant", () => {
    const progress = levelTrack.resolve(1, 400 + 900 + 50);
    expect(progress.level).toBe(3);
    expect(progress.xp).toBe(50);
    expect(progress.levelsGained).toBe(2);
  });
});

describe("kill xp (upstream zeroDiff rules)", () => {
  test("even-level kill pays base 45 + 5·level", () => {
    expect(killXp(5, 5)).toBe(70);
  });

  test("higher mobs pay up to +20%", () => {
    expect(killXp(5, 9)).toBe(Math.round(90 * 1.2));
  });

  test("gray kills pay zero at the zeroDiff gap", () => {
    expect(killXp(5, 0)).toBe(0);
    expect(killXp(20, 12)).toBe(0);
    expect(killXp(20, 13)).toBeGreaterThan(0);
  });
});

describe("group xp bonus", () => {
  test("matches upstream table", () => {
    expect(groupXpMultiplier(1)).toBe(GROUP_XP_BONUS[0]);
    expect(groupXpMultiplier(3)).toBe(1.166);
    expect(groupXpMultiplier(5)).toBe(1.43);
    expect(groupXpMultiplier(9)).toBe(1.43);
  });
});

describe("weapon and spell scaling", () => {
  test("weapon roll stays within min/max plus AP bonus", () => {
    const weapon = { min: 2, max: 5, speed: 2 };
    for (let i = 0; i < 40; i += 1) {
      const roll = rollWeaponDamage(() => i / 40, weapon, 14);
      expect(roll).toBeGreaterThanOrEqual(4);
      expect(roll).toBeLessThanOrEqual(7);
    }
  });

  test("spell amount scales with spell power via cast-time coefficient", () => {
    const instant = spellAmount(20, 2, 5, 100, undefined, 0);
    const hardCast = spellAmount(20, 2, 5, 100, undefined, 3.5);
    expect(hardCast).toBeGreaterThan(instant);
    expect(hardCast).toBe(20 + 8 + 100);
  });
});

describe("mob scaling and fall damage", () => {
  test("mob hp/damage grow linearly with level", () => {
    expect(mobHp(40, 14, 2)).toBe(68);
    expect(mobDamage(3, 1.6, 2)).toBe(6);
  });

  test("falls are safe to 12yd then cost 7% max hp per yard", () => {
    expect(fallDamage(100, 12)).toBe(0);
    expect(fallDamage(100, 14)).toBe(14);
  });
});
