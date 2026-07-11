export type UpperCategory = "ones" | "twos" | "threes" | "fours" | "fives" | "sixes";

export type LowerCategory =
  | "threeKind"
  | "fourKind"
  | "fullHouse"
  | "smallStraight"
  | "largeStraight"
  | "yacht"
  | "chance";

export type Category = UpperCategory | LowerCategory;

export const UPPER_CATEGORIES: readonly UpperCategory[] = [
  "ones",
  "twos",
  "threes",
  "fours",
  "fives",
  "sixes",
];

export const LOWER_CATEGORIES: readonly LowerCategory[] = [
  "threeKind",
  "fourKind",
  "fullHouse",
  "smallStraight",
  "largeStraight",
  "yacht",
  "chance",
];

export const CATEGORIES: readonly Category[] = [...UPPER_CATEGORIES, ...LOWER_CATEGORIES];

export type Dice = readonly number[];

const FACE_OF: Readonly<Record<UpperCategory, number>> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
};

function tally(dice: Dice): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const die of dice) {
    if (die >= 1 && die <= 6) counts[die] += 1;
  }
  return counts;
}

function sum(dice: Dice): number {
  return dice.reduce((total, die) => total + die, 0);
}

/** Five of one face. */
export function isYacht(dice: Dice): boolean {
  return tally(dice).some((count) => count === 5);
}

function hasNOfAKind(dice: Dice, n: number): boolean {
  return tally(dice).some((count) => count >= n);
}

/** Exactly three of one face and two of another (distinct faces) — five-of-a-kind is NOT a full house. */
function isFullHouse(dice: Dice): boolean {
  const groups = tally(dice)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  return groups.length === 2 && groups[0] === 2 && groups[1] === 3;
}

/** Longest run of consecutive distinct faces is at least `length` (duplicates are ignored). */
function hasStraight(dice: Dice, length: number): boolean {
  const present = new Set(dice);
  let run = 0;
  let best = 0;
  for (let face = 1; face <= 6; face += 1) {
    if (present.has(face)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best >= length;
}

function upperScore(face: number, dice: Dice): number {
  return dice.reduce((total, die) => total + (die === face ? face : 0), 0);
}

function assertNever(value: never): never {
  throw new Error(`unhandled category: ${String(value)}`);
}

/** The score this category would bank for these dice (the live ghost value). */
export function scoreCategory(category: Category, dice: Dice): number {
  switch (category) {
    case "ones":
    case "twos":
    case "threes":
    case "fours":
    case "fives":
    case "sixes":
      return upperScore(FACE_OF[category], dice);
    case "threeKind":
      return hasNOfAKind(dice, 3) ? sum(dice) : 0;
    case "fourKind":
      return hasNOfAKind(dice, 4) ? sum(dice) : 0;
    case "fullHouse":
      return isFullHouse(dice) ? 25 : 0;
    case "smallStraight":
      return hasStraight(dice, 4) ? 30 : 0;
    case "largeStraight":
      return hasStraight(dice, 5) ? 40 : 0;
    case "yacht":
      return isYacht(dice) ? 50 : 0;
    case "chance":
      return sum(dice);
    default:
      return assertNever(category);
  }
}
