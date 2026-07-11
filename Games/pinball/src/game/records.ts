import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

export type PinballRecords = RecordBook<"score" | "ball">;

export function createRecords(storage: RecordStorage | null): PinballRecords {
  return createRecordBook<"score" | "ball">({
    key: "pinball:bally-1978:v1",
    fields: { score: "higher", ball: "higher" },
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
