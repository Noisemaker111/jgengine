import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

export type PachinkoRecords = RecordBook<"bank" | "fever">;

export function createRecords(storage: RecordStorage | null): PachinkoRecords {
  return createRecordBook<"bank" | "fever">({
    key: "pachinko-parlor:v1",
    fields: { bank: "higher", fever: "higher" },
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
