import { describe, expect, test } from "bun:test";
import { chamfer, clampFraction, edgeNotch, formatTimer, padScore, slantBar } from "./chrome";
import { GAME_ICON_NAMES, iconForItemId } from "./icons";
import { emberTheme, fieldkitTheme, rarityColor, synthwaveTheme, vitalColors } from "./theme";

describe("chrome helpers", () => {
  test("formatTimer renders m:ss and clamps negatives", () => {
    expect(formatTimer(0)).toBe("0:00");
    expect(formatTimer(9)).toBe("0:09");
    expect(formatTimer(84)).toBe("1:24");
    expect(formatTimer(600)).toBe("10:00");
    expect(formatTimer(-5)).toBe("0:00");
  });

  test("padScore zero-pads and floors", () => {
    expect(padScore(0)).toBe("000000");
    expect(padScore(1284, 6)).toBe("001284");
    expect(padScore(99.9, 4)).toBe("0099");
    expect(padScore(-3, 4)).toBe("0000");
  });

  test("clampFraction bounds to 0..1 and absorbs NaN", () => {
    expect(clampFraction(0.4)).toBe(0.4);
    expect(clampFraction(-2)).toBe(0);
    expect(clampFraction(7)).toBe(1);
    expect(clampFraction(Number.NaN)).toBe(0);
  });

  test("clip shapes emit polygon strings", () => {
    expect(chamfer(6)).toStartWith("polygon(");
    expect(chamfer(6)).toContain("6px");
    expect(slantBar(8)).toStartWith("polygon(");
    expect(edgeNotch(10)).toStartWith("polygon(");
  });
});

describe("theme", () => {
  test("vitalColors maps every tone in every theme", () => {
    for (const theme of [emberTheme, synthwaveTheme, fieldkitTheme]) {
      for (const tone of ["health", "mana", "stamina", "xp", "shield"] as const) {
        const colors = vitalColors(theme, tone);
        expect(colors.fill).toMatch(/^#/);
        expect(colors.deep).toMatch(/^#/);
      }
    }
  });

  test("rarityColor falls back to common", () => {
    expect(rarityColor(emberTheme, undefined)).toBe(emberTheme.rarity.common);
    expect(rarityColor(emberTheme, "legendary")).toBe(emberTheme.rarity.legendary);
  });
});

describe("icons", () => {
  test("catalog names are unique", () => {
    expect(new Set(GAME_ICON_NAMES).size).toBe(GAME_ICON_NAMES.length);
  });

  test("iconForItemId matches common item id shapes", () => {
    expect(iconForItemId("iron_sword")).toBe("sword");
    expect(iconForItemId("HealingPotion")).toBe("potionRed");
    expect(iconForItemId("oak-wood")).toBe("wood");
    expect(iconForItemId("gold_coin")).toBe("coin");
    expect(iconForItemId("mystery")).toBeNull();
  });
});
