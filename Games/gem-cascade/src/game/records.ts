import { createRecordBook, type RecordBook } from "@jgengine/core/game/recordBook";

export type RecordField = "endless" | "timed";

const storage = typeof localStorage !== "undefined" ? localStorage : null;

export const records: RecordBook<RecordField> = createRecordBook<RecordField>({
  key: "gem-cascade",
  fields: { endless: "higher", timed: "higher" },
  storage,
});
