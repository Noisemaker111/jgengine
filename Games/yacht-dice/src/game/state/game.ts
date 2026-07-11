import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";
import { seededRng } from "@jgengine/core/random/rng";
import { dailySeed } from "@jgengine/core/random/seedLink";

import { CATEGORIES, type Category } from "../score/categories";
import {
  bankCategory,
  createSheet,
  grandTotal,
  isComplete,
  type Sheet,
} from "../score/sheet";

export const DICE_COUNT = 5;
export const MAX_ROLLS = 3;

export type Phase = "playing" | "over";

export interface LastBank {
  readonly category: Category;
  readonly scored: number;
  readonly extraYacht: number;
}

export interface YachtState {
  readonly seed: string;
  readonly daily: boolean;
  readonly dice: number[];
  readonly held: boolean[];
  /** Per-die animation counter; reset each turn so rerolled dice remount and tumble. */
  readonly spins: number[];
  /** Cumulative seeded-RNG draws this game — the deterministic dice cursor. */
  readonly draws: number;
  readonly rollsLeft: number;
  readonly hasRolled: boolean;
  readonly sheet: Sheet;
  readonly phase: Phase;
  readonly lastBank: LastBank | null;
  readonly bestTotal: number | null;
  readonly categoryBests: Readonly<Partial<Record<Category, number>>>;
}

export type RecordField = "total" | Category;

const RECORD_KEY = "yacht-dice.records";

function recordFields(): Record<RecordField, "higher"> {
  const fields = { total: "higher" } as Record<RecordField, "higher">;
  for (const category of CATEGORIES) fields[category] = "higher";
  return fields;
}

export function createRecords(storage: RecordStorage | null): RecordBook<RecordField> {
  return createRecordBook<RecordField>({ key: RECORD_KEY, fields: recordFields(), storage });
}

function defaultStorage(): RecordStorage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

let sharedBook: RecordBook<RecordField> | null = null;

function records(): RecordBook<RecordField> {
  if (sharedBook === null) sharedBook = createRecords(defaultStorage());
  return sharedBook;
}

function pickCategoryBests(
  best: Readonly<Partial<Record<RecordField, number>>>,
): Partial<Record<Category, number>> {
  const out: Partial<Record<Category, number>> = {};
  for (const category of CATEGORIES) {
    const value = best[category];
    if (value !== undefined) out[category] = value;
  }
  return out;
}

export function createGame(
  seed: string,
  daily: boolean,
  bestTotal: number | null,
  categoryBests: Partial<Record<Category, number>>,
): YachtState {
  return {
    seed,
    daily,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    spins: [0, 0, 0, 0, 0],
    draws: 0,
    rollsLeft: MAX_ROLLS,
    hasRolled: false,
    sheet: createSheet(),
    phase: "playing",
    lastBank: null,
    bestTotal,
    categoryBests,
  };
}

let seedCounter = 0;

export function freshSeed(): string {
  seedCounter += 1;
  return `${Date.now().toString(36)}-${seedCounter.toString(36)}`;
}

/** Start a fresh seeded game, seeding the "best" display from the record book. */
export function startSeeded(seed?: string): YachtState {
  const best = records().best();
  const resolved = seed !== undefined && seed.length > 0 ? seed : freshSeed();
  return createGame(resolved, false, best.total ?? null, pickCategoryBests(best));
}

/** Start today's daily run (shared UTC seed). */
export function startDaily(nowMs: number = Date.now()): YachtState {
  const best = records().best();
  return createGame(dailySeed(nowMs), true, best.total ?? null, pickCategoryBests(best));
}

/** Roll: reroll every unheld die, drawing deterministically from the game's cursor. */
export function roll(state: YachtState): YachtState {
  if (state.phase !== "playing" || state.rollsLeft <= 0) return state;
  const rng = seededRng(state.seed);
  for (let i = 0; i < state.draws; i += 1) rng();
  const held = state.hasRolled ? state.held : [false, false, false, false, false];
  const dice = state.dice.slice();
  const spins = state.spins.slice();
  let draws = state.draws;
  for (let i = 0; i < DICE_COUNT; i += 1) {
    if (held[i]) continue;
    dice[i] = Math.floor(rng() * 6) + 1;
    spins[i] += 1;
    draws += 1;
  }
  return {
    ...state,
    dice,
    spins,
    held,
    draws,
    hasRolled: true,
    rollsLeft: state.rollsLeft - 1,
  };
}

export function toggleHold(state: YachtState, index: number): YachtState {
  if (state.phase !== "playing" || !state.hasRolled || state.rollsLeft <= 0) return state;
  if (index < 0 || index >= DICE_COUNT) return state;
  const held = state.held.slice();
  held[index] = !held[index];
  return { ...state, held };
}

/** Bank the current dice into `category`, ending the turn (or the game at 13 banked). */
export function bank(state: YachtState, category: Category): YachtState {
  if (state.phase !== "playing" || !state.hasRolled) return state;
  if (state.sheet.scores[category] !== undefined) return state;
  const result = bankCategory(state.sheet, category, state.dice);
  const lastBank: LastBank = {
    category,
    scored: result.scored,
    extraYacht: result.extraYacht,
  };
  if (isComplete(result.sheet)) {
    const total = grandTotal(result.sheet);
    const submission: Partial<Record<RecordField, number>> = { total };
    for (const cat of CATEGORIES) submission[cat] = result.sheet.scores[cat] ?? 0;
    records().submit(submission);
    const best = records().best();
    return {
      ...state,
      sheet: result.sheet,
      phase: "over",
      lastBank,
      bestTotal: best.total ?? total,
      categoryBests: pickCategoryBests(best),
    };
  }
  return {
    ...state,
    sheet: result.sheet,
    lastBank,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    spins: [0, 0, 0, 0, 0],
    rollsLeft: MAX_ROLLS,
    hasRolled: false,
  };
}
