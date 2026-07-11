import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

import type { AiLevel } from "./ai";
import type { RecordsView } from "./state";

const LEVELS: readonly AiLevel[] = ["novice", "club", "master"];
const TALLY_KEY = "reversi:tallies";
const MARGIN_KEY = "reversi:best-margin";

export type Outcome = "win" | "loss" | "draw";

interface Tally {
  wins: number;
  losses: number;
  draws: number;
}
type TallyMap = Record<AiLevel, Tally>;

function browserStorage(): RecordStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

let storageRef: RecordStorage | null | undefined;
function storage(): RecordStorage | null {
  if (storageRef === undefined) storageRef = browserStorage();
  return storageRef;
}

let marginBook: RecordBook<AiLevel> | null = null;
function bestMarginBook(): RecordBook<AiLevel> {
  if (marginBook === null) {
    marginBook = createRecordBook<AiLevel>({
      key: MARGIN_KEY,
      fields: { novice: "higher", club: "higher", master: "higher" },
      storage: storage(),
    });
  }
  return marginBook;
}

function emptyTallies(): TallyMap {
  return {
    novice: { wins: 0, losses: 0, draws: 0 },
    club: { wins: 0, losses: 0, draws: 0 },
    master: { wins: 0, losses: 0, draws: 0 },
  };
}

function nonNegInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function readTallies(): TallyMap {
  const base = emptyTallies();
  const s = storage();
  if (s === null) return base;
  let raw: string | null;
  try {
    raw = s.getItem(TALLY_KEY);
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
  for (const lvl of LEVELS) {
    const entry = (parsed as Record<string, unknown>)[lvl];
    if (typeof entry === "object" && entry !== null) {
      const e = entry as Record<string, unknown>;
      base[lvl] = { wins: nonNegInt(e.wins), losses: nonNegInt(e.losses), draws: nonNegInt(e.draws) };
    }
  }
  return base;
}

function writeTallies(t: TallyMap): void {
  const s = storage();
  if (s === null) return;
  try {
    s.setItem(TALLY_KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable — degrade silently */
  }
}

export function recordOutcome(level: AiLevel, outcome: Outcome, margin: number): void {
  const t = readTallies();
  if (outcome === "win") t[level].wins += 1;
  else if (outcome === "loss") t[level].losses += 1;
  else t[level].draws += 1;
  writeTallies(t);
  if (outcome === "win") bestMarginBook().submit({ [level]: margin });
}

export function readRecords(): RecordsView {
  const t = readTallies();
  const best = bestMarginBook().best();
  return {
    wins: { novice: t.novice.wins, club: t.club.wins, master: t.master.wins },
    losses: { novice: t.novice.losses, club: t.club.losses, master: t.master.losses },
    draws: { novice: t.novice.draws, club: t.club.draws, master: t.master.draws },
    bestMargin: { ...best },
  };
}

export function resetRecords(): void {
  writeTallies(emptyTallies());
  bestMarginBook().clear();
}
