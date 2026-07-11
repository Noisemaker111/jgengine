import { describe, expect, test } from "bun:test";

import { CATEGORIES, type Category } from "./categories";
import {
  EXTRA_YACHT_BONUS,
  bankCategory,
  createSheet,
  grandTotal,
  isBanked,
  isComplete,
  openCategories,
  upperBonus,
  upperSubtotal,
  type Sheet,
} from "./sheet";

function sheetOf(scores: Partial<Record<Category, number>>, yachtBonus = 0): Sheet {
  return { scores, yachtBonus };
}

describe("banking", () => {
  test("records the score without mutating the source sheet", () => {
    const start = createSheet();
    const result = bankCategory(start, "chance", [1, 2, 3, 4, 5]);
    expect(result.scored).toBe(15);
    expect(result.sheet.scores.chance).toBe(15);
    expect(isBanked(result.sheet, "chance")).toBe(true);
    expect(isBanked(start, "chance")).toBe(false);
  });

  test("banking an already-scored category is a no-op", () => {
    const start = sheetOf({ chance: 15 });
    const result = bankCategory(start, "chance", [6, 6, 6, 6, 6]);
    expect(result.scored).toBe(0);
    expect(result.sheet.scores.chance).toBe(15);
  });

  test("a zero-scoring category can be banked (sacrifice)", () => {
    const result = bankCategory(createSheet(), "yacht", [1, 2, 3, 4, 5]);
    expect(result.scored).toBe(0);
    expect(isBanked(result.sheet, "yacht")).toBe(true);
  });
});

describe("upper bonus boundary", () => {
  test("62 in the upper section earns no bonus", () => {
    const sheet = sheetOf({ ones: 2, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
    expect(upperSubtotal(sheet)).toBe(62);
    expect(upperBonus(sheet)).toBe(0);
  });

  test("exactly 63 earns the +35 bonus", () => {
    const sheet = sheetOf({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
    expect(upperSubtotal(sheet)).toBe(63);
    expect(upperBonus(sheet)).toBe(35);
  });

  test("above 63 still earns exactly +35", () => {
    const sheet = sheetOf({ ones: 5, twos: 10, threes: 15, fours: 12, fives: 15, sixes: 18 });
    expect(upperBonus(sheet)).toBe(35);
  });
});

describe("extra-yacht rule", () => {
  test("a second yacht scores +100 when the Yacht box already holds 50", () => {
    const start = sheetOf({ yacht: 50 });
    const result = bankCategory(start, "threes", [3, 3, 3, 3, 3]);
    expect(result.scored).toBe(15);
    expect(result.extraYacht).toBe(EXTRA_YACHT_BONUS);
    expect(result.sheet.yachtBonus).toBe(100);
  });

  test("no bonus when the Yacht box holds 0 (yacht was sacrificed)", () => {
    const start = sheetOf({ yacht: 0 });
    const result = bankCategory(start, "fours", [4, 4, 4, 4, 4]);
    expect(result.extraYacht).toBe(0);
    expect(result.sheet.yachtBonus).toBe(0);
  });

  test("the first yacht (banked in the Yacht box) never earns the bonus", () => {
    const first = bankCategory(createSheet(), "yacht", [5, 5, 5, 5, 5]);
    expect(first.scored).toBe(50);
    expect(first.extraYacht).toBe(0);

    const second = bankCategory(first.sheet, "chance", [5, 5, 5, 5, 5]);
    expect(second.extraYacht).toBe(EXTRA_YACHT_BONUS);
    expect(second.sheet.yachtBonus).toBe(100);
  });

  test("non-yacht dice never trigger the bonus even with a 50 in the box", () => {
    const result = bankCategory(sheetOf({ yacht: 50 }), "chance", [1, 2, 3, 4, 5]);
    expect(result.extraYacht).toBe(0);
  });
});

describe("totals and completion", () => {
  test("grand total sums upper + bonus + lower + yacht bonus", () => {
    const sheet = sheetOf(
      {
        ones: 3,
        twos: 6,
        threes: 9,
        fours: 12,
        fives: 15,
        sixes: 18,
        threeKind: 20,
        fourKind: 0,
        fullHouse: 25,
        smallStraight: 30,
        largeStraight: 40,
        yacht: 50,
        chance: 22,
      },
      100,
    );
    // upper 63 (+35 bonus) + lower 187 + 100 yacht bonus
    expect(upperSubtotal(sheet)).toBe(63);
    expect(grandTotal(sheet)).toBe(63 + 35 + 187 + 100);
  });

  test("isComplete only when all 13 categories are banked", () => {
    let sheet = createSheet();
    expect(isComplete(sheet)).toBe(false);
    for (const category of CATEGORIES) {
      sheet = bankCategory(sheet, category, [1, 1, 1, 1, 1]).sheet;
    }
    expect(openCategories(sheet)).toHaveLength(0);
    expect(isComplete(sheet)).toBe(true);
  });
});
