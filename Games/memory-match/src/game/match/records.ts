import { createRecordBook, type RecordSubmission } from "@jgengine/core/game/recordBook";

import type { BoardSizeId } from "./catalog";

export type RecordField = `moves:${BoardSizeId}` | `time:${BoardSizeId}`;

export type BestSubmission = RecordSubmission<RecordField>;

const FIELDS: Readonly<Record<RecordField, "lower">> = {
  "moves:4x4": "lower",
  "time:4x4": "lower",
  "moves:6x6": "lower",
  "time:6x6": "lower",
};

export const records = createRecordBook<RecordField>({
  key: "memory-match:bests",
  fields: FIELDS,
  storage: typeof localStorage === "undefined" ? null : localStorage,
});

export function movesFieldOf(sizeId: BoardSizeId): RecordField {
  return `moves:${sizeId}`;
}

export function timeFieldOf(sizeId: BoardSizeId): RecordField {
  return `time:${sizeId}`;
}
