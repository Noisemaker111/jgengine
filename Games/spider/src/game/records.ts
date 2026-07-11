import { createRecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

import type { SuitCount } from "./spider/engine";

function browserStorage(): RecordStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

type ScoreField = "score1" | "score2" | "score4";
type TimeField = "time1" | "time2" | "time4";
type Field = ScoreField | TimeField;

const book = createRecordBook({
  key: "spider-records",
  fields: {
    score1: "higher",
    score2: "higher",
    score4: "higher",
    time1: "lower",
    time2: "lower",
    time4: "lower",
  } as const,
  storage: browserStorage(),
});

function scoreField(suits: SuitCount): ScoreField {
  return suits === 1 ? "score1" : suits === 2 ? "score2" : "score4";
}

function timeField(suits: SuitCount): TimeField {
  return suits === 1 ? "time1" : suits === 2 ? "time2" : "time4";
}

export interface BestSnapshot {
  score: number | null;
  time: number | null;
}

export function currentBests(suits: SuitCount): BestSnapshot {
  return {
    score: book.bestOf(scoreField(suits)),
    time: book.bestOf(timeField(suits)),
  };
}

export function recordWin(
  suits: SuitCount,
  score: number,
  elapsedMs: number,
): { improved: string[] } {
  const run: Partial<Record<Field, number>> = {};
  run[scoreField(suits)] = score;
  run[timeField(suits)] = elapsedMs;
  return { improved: book.submit(run).improved.map((field) => String(field)) };
}

const DIFFICULTY_KEY = "spider:difficulty";

export function readDifficulty(): SuitCount {
  const storage = browserStorage();
  if (storage === null) return 1;
  try {
    const raw = storage.getItem(DIFFICULTY_KEY);
    const n = raw === null ? 1 : Number.parseInt(raw, 10);
    return n === 2 ? 2 : n === 4 ? 4 : 1;
  } catch {
    return 1;
  }
}

export function writeDifficulty(suits: SuitCount): void {
  const storage = browserStorage();
  if (storage === null) return;
  try {
    storage.setItem(DIFFICULTY_KEY, String(suits));
  } catch {
    // storage unavailable — preference degrades to session-only
  }
}
