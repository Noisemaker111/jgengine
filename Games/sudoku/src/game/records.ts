import { createRecordBook, type RecordBook } from "@jgengine/core/game/recordBook";

import type { Difficulty } from "./sudoku/difficulty";

let book: RecordBook<Difficulty> | null = null;

function getBook(): RecordBook<Difficulty> {
  if (book === null) {
    book = createRecordBook<Difficulty>({
      key: "sudoku:best-times",
      fields: { easy: "lower", medium: "lower", hard: "lower", expert: "lower" },
      storage: typeof localStorage !== "undefined" ? localStorage : null,
    });
  }
  return book;
}

export function readBests(): Partial<Record<Difficulty, number>> {
  return { ...getBook().best() };
}

export function submitTime(difficulty: Difficulty, seconds: number): boolean {
  const run: Partial<Record<Difficulty, number>> = { [difficulty]: seconds };
  return getBook().submit(run).improved.includes(difficulty);
}

export function clearBests(): void {
  getBook().clear();
}
