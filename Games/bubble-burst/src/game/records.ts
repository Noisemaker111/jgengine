import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

export type BubbleRecords = RecordBook<"score" | "level">;

export function createRecords(storage: RecordStorage | null): BubbleRecords {
  return createRecordBook<"score" | "level">({
    key: "bubble-burst:v1",
    fields: { score: "higher", level: "higher" },
    storage,
  });
}

export function browserStorage(): RecordStorage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    return null;
  }
  return null;
}
