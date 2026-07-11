import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

import type { AiLevel } from "./logic/ai";

export type Outcome = "win" | "loss" | "draw";

export interface Tally {
  win: number;
  loss: number;
  draw: number;
}

export interface RecordsView {
  /** Mutable, resettable win/loss/draw counts per AI level (via RecordStorage). */
  tallies: Record<AiLevel, Tally>;
  /** Live consecutive-win streak per level (mutable). */
  streak: Record<AiLevel, number>;
  /** Monotonic best streak per level (via the recordBook). */
  bestStreak: Partial<Record<AiLevel, number>>;
}

const LEVELS: AiLevel[] = ["easy", "medium", "hard"];
const TALLY_KEY = "four-in-a-row:tallies";
const STREAK_BOOK_KEY = "four-in-a-row:best-streaks";

interface Persisted {
  tallies: Record<AiLevel, Tally>;
  streak: Record<AiLevel, number>;
}

function storage(): RecordStorage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function emptyTally(): Tally {
  return { win: 0, loss: 0, draw: 0 };
}

function emptyPersisted(): Persisted {
  return {
    tallies: { easy: emptyTally(), medium: emptyTally(), hard: emptyTally() },
    streak: { easy: 0, medium: 0, hard: 0 },
  };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function load(): Persisted {
  const base = emptyPersisted();
  const store = storage();
  if (store === null) return base;
  let raw: string | null;
  try {
    raw = store.getItem(TALLY_KEY);
  } catch {
    return base;
  }
  if (raw === null) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (typeof parsed !== "object" || parsed === null) return base;
  const record = parsed as Record<string, unknown>;
  const tallies = record["tallies"] as Record<string, unknown> | undefined;
  const streak = record["streak"] as Record<string, unknown> | undefined;
  for (const level of LEVELS) {
    const t = tallies?.[level] as Record<string, unknown> | undefined;
    base.tallies[level] = { win: num(t?.["win"]), loss: num(t?.["loss"]), draw: num(t?.["draw"]) };
    base.streak[level] = num(streak?.[level]);
  }
  return base;
}

function save(data: Persisted): void {
  const store = storage();
  if (store === null) return;
  try {
    store.setItem(TALLY_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — records degrade to session-only */
  }
}

let book: RecordBook<AiLevel> | null = null;

function getBook(): RecordBook<AiLevel> {
  if (book === null) {
    book = createRecordBook<AiLevel>({
      key: STREAK_BOOK_KEY,
      fields: { easy: "higher", medium: "higher", hard: "higher" },
      storage: storage(),
    });
  }
  return book;
}

function view(data: Persisted): RecordsView {
  return { tallies: data.tallies, streak: data.streak, bestStreak: { ...getBook().best() } };
}

export function readRecords(): RecordsView {
  return view(load());
}

/** Fold one finished AI game into the records. Returns the refreshed view + whether the best streak improved. */
export function recordResult(level: AiLevel, outcome: Outcome): { view: RecordsView; newBestStreak: boolean } {
  const data = load();
  const tally = data.tallies[level];
  if (outcome === "win") {
    tally.win += 1;
    data.streak[level] += 1;
  } else if (outcome === "loss") {
    tally.loss += 1;
    data.streak[level] = 0;
  } else {
    tally.draw += 1;
    data.streak[level] = 0;
  }
  save(data);

  let newBestStreak = false;
  if (outcome === "win") {
    newBestStreak = getBook().submit({ [level]: data.streak[level] }).improved.includes(level);
  }
  return { view: view(data), newBestStreak };
}

export function resetRecords(): RecordsView {
  const base = emptyPersisted();
  save(base);
  getBook().clear();
  return view(base);
}
