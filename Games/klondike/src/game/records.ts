import { createRecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

import type { DrawMode } from "./klondike/engine";

const storage: RecordStorage | null =
  typeof window !== "undefined" && window.localStorage ? window.localStorage : null;

const book = createRecordBook({
  key: "klondike-records",
  fields: { time1: "lower", time3: "lower", moves1: "lower", moves3: "lower" } as const,
  storage,
});

export interface BestSnapshot {
  time: number | null;
  moves: number | null;
}

export function currentBests(drawMode: DrawMode): BestSnapshot {
  const best = book.best();
  return drawMode === 1
    ? { time: best.time1 ?? null, moves: best.moves1 ?? null }
    : { time: best.time3 ?? null, moves: best.moves3 ?? null };
}

export function recordWin(drawMode: DrawMode, elapsedMs: number, moves: number): { improved: string[] } {
  const run = drawMode === 1 ? { time1: elapsedMs, moves1: moves } : { time3: elapsedMs, moves3: moves };
  return { improved: book.submit(run).improved.map((field) => String(field)) };
}
