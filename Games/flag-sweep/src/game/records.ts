import { createRecordBook, type RecordBook } from "@jgengine/core/game/recordBook";

import type { StandardDifficulty } from "./board";

let book: RecordBook<StandardDifficulty> | null = null;

function getBook(): RecordBook<StandardDifficulty> {
  if (book === null) {
    book = createRecordBook<StandardDifficulty>({
      key: "flag-sweep:best-times",
      fields: { beginner: "lower", intermediate: "lower", expert: "lower" },
      storage: typeof localStorage !== "undefined" ? localStorage : null,
    });
  }
  return book;
}

export function readBests(): Partial<Record<StandardDifficulty, number>> {
  return { ...getBook().best() };
}

export function submitTime(difficulty: StandardDifficulty, seconds: number): boolean {
  const run: Partial<Record<StandardDifficulty, number>> = { [difficulty]: seconds };
  return getBook().submit(run).improved.includes(difficulty);
}

export function clearBests(): void {
  getBook().clear();
}
