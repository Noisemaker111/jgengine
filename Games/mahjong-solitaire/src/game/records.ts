import { createRecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

const storage: RecordStorage | null =
  typeof window !== "undefined" && window.localStorage ? window.localStorage : null;

const book = createRecordBook({
  key: "mahjong-solitaire-records",
  fields: { time: "lower" } as const,
  storage,
});

export function currentBest(): number | null {
  return book.bestOf("time");
}

export function recordWin(elapsedMs: number): { improved: string[]; best: number | null } {
  const submission = book.submit({ time: elapsedMs });
  return { improved: submission.improved.map((field) => String(field)), best: book.bestOf("time") };
}
