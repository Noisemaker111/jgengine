import {
  createRecordBook,
  type RecordStorage,
  type RecordSubmission,
} from "@jgengine/core/game/recordBook";

export type RecordField = "length:classic";

export type BestSubmission = RecordSubmission<RecordField>;

export const BEST_LENGTH_FIELD: RecordField = "length:classic";

function browserStorage(): RecordStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export const records = createRecordBook<RecordField>({
  key: "echo-lights:bests",
  fields: { "length:classic": "higher" },
  storage: browserStorage(),
});
