import {
  createRecordBook,
  type RecordBook,
  type RecordDirection,
  type RecordStorage,
} from "@jgengine/core/game/recordBook";

import { MODE_KEYS, type ModeKey } from "./codebreaker";

export interface ModeRecord {
  /** Current consecutive-win streak (mutable — resets to 0 on a loss). */
  readonly streak: number;
  /** Longest streak ever reached in this mode (monotonic). */
  readonly bestStreak: number;
  /** Fewest guesses used to win in this mode (monotonic), or null. */
  readonly fewest: number | null;
}

export type RecordsSnapshot = Readonly<Record<ModeKey, ModeRecord>>;

/** Monotonic bests live in the record book; the mutable streak lives beside it. */
type BestField = `${ModeKey}:streak` | `${ModeKey}:fewest`;

const BESTS_KEY = "codebreaker:bests";
const STREAK_KEY = "codebreaker:streaks";

function resolveStorage(): RecordStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

let bookRef: RecordBook<BestField> | null = null;

function book(): RecordBook<BestField> {
  if (bookRef === null) {
    const fields: Record<string, RecordDirection> = {};
    for (const mode of MODE_KEYS) {
      fields[`${mode}:streak`] = "higher";
      fields[`${mode}:fewest`] = "lower";
    }
    bookRef = createRecordBook<BestField>({
      key: BESTS_KEY,
      fields: fields as Record<BestField, RecordDirection>,
      storage: resolveStorage(),
    });
  }
  return bookRef;
}

let streakCache: Record<string, number> | null = null;

function loadStreaks(): Record<string, number> {
  const storage = resolveStorage();
  if (storage === null) return {};
  let raw: string | null;
  try {
    raw = storage.getItem(STREAK_KEY);
  } catch {
    return {};
  }
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const out: Record<string, number> = {};
  for (const mode of MODE_KEYS) {
    const value = (parsed as Record<string, unknown>)[mode];
    if (typeof value === "number" && Number.isFinite(value)) out[mode] = value;
  }
  return out;
}

function streaks(): Record<string, number> {
  if (streakCache === null) streakCache = loadStreaks();
  return streakCache;
}

function persistStreaks(): void {
  if (streakCache === null) return;
  const storage = resolveStorage();
  if (storage === null) return;
  try {
    storage.setItem(STREAK_KEY, JSON.stringify(streakCache));
  } catch {
    /* storage unavailable — keep the in-memory cache */
  }
}

export function readRecords(): RecordsSnapshot {
  const best = book().best();
  const current = streaks();
  const out = {} as Record<ModeKey, ModeRecord>;
  for (const mode of MODE_KEYS) {
    out[mode] = {
      streak: current[mode] ?? 0,
      bestStreak: best[`${mode}:streak`] ?? 0,
      fewest: best[`${mode}:fewest`] ?? null,
    };
  }
  return out;
}

export interface WinOutcome {
  readonly streak: number;
  readonly newBestStreak: boolean;
  readonly newFewest: boolean;
}

export function recordWin(mode: ModeKey, guesses: number): WinOutcome {
  const current = streaks();
  const streak = (current[mode] ?? 0) + 1;
  current[mode] = streak;
  persistStreaks();
  const submission = book().submit({
    [`${mode}:streak`]: streak,
    [`${mode}:fewest`]: guesses,
  } as Partial<Record<BestField, number>>);
  return {
    streak,
    newBestStreak: submission.improved.includes(`${mode}:streak`),
    newFewest: submission.improved.includes(`${mode}:fewest`),
  };
}

export function recordLoss(mode: ModeKey): void {
  const current = streaks();
  current[mode] = 0;
  persistStreaks();
}

export function clearRecords(): void {
  book().clear();
  streakCache = {};
  persistStreaks();
}
