import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

function browserStorage(): RecordStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export const records: RecordBook<"best"> = createRecordBook<"best">({
  key: "slide-2048/best",
  fields: { best: "higher" },
  storage: browserStorage(),
});

export function bestScore(): number {
  return records.bestOf("best") ?? 0;
}

export function recordScore(score: number): number {
  records.submit({ best: score });
  return bestScore();
}
