import {
  CATEGORIES,
  LOWER_CATEGORIES,
  UPPER_CATEGORIES,
  isYacht,
  scoreCategory,
  type Category,
  type Dice,
} from "./categories";

export const UPPER_BONUS_THRESHOLD = 63;
export const UPPER_BONUS = 35;
export const EXTRA_YACHT_BONUS = 100;

export interface Sheet {
  readonly scores: Readonly<Partial<Record<Category, number>>>;
  /** Accumulated +100 bonuses for extra yachts rolled while the Yacht box holds 50. */
  readonly yachtBonus: number;
}

export function createSheet(): Sheet {
  return { scores: {}, yachtBonus: 0 };
}

export function isBanked(sheet: Sheet, category: Category): boolean {
  return sheet.scores[category] !== undefined;
}

export function openCategories(sheet: Sheet): Category[] {
  return CATEGORIES.filter((category) => !isBanked(sheet, category));
}

export function isComplete(sheet: Sheet): boolean {
  return openCategories(sheet).length === 0;
}

export interface BankResult {
  readonly sheet: Sheet;
  readonly scored: number;
  readonly extraYacht: number;
}

/**
 * Bank `dice` into `category`. Awards the extra-yacht bonus (+100) when the dice
 * are a yacht, the Yacht box already holds 50, and this is not the Yacht box
 * itself. Banking an already-scored category is a no-op.
 */
export function bankCategory(sheet: Sheet, category: Category, dice: Dice): BankResult {
  if (isBanked(sheet, category)) return { sheet, scored: 0, extraYacht: 0 };
  const scored = scoreCategory(category, dice);
  const extraYacht =
    isYacht(dice) && sheet.scores.yacht === 50 && category !== "yacht" ? EXTRA_YACHT_BONUS : 0;
  return {
    sheet: {
      scores: { ...sheet.scores, [category]: scored },
      yachtBonus: sheet.yachtBonus + extraYacht,
    },
    scored,
    extraYacht,
  };
}

export function upperSubtotal(sheet: Sheet): number {
  return UPPER_CATEGORIES.reduce((total, category) => total + (sheet.scores[category] ?? 0), 0);
}

export function upperBonus(sheet: Sheet): number {
  return upperSubtotal(sheet) >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
}

export function lowerSubtotal(sheet: Sheet): number {
  return LOWER_CATEGORIES.reduce((total, category) => total + (sheet.scores[category] ?? 0), 0);
}

export function grandTotal(sheet: Sheet): number {
  return upperSubtotal(sheet) + upperBonus(sheet) + lowerSubtotal(sheet) + sheet.yachtBonus;
}
