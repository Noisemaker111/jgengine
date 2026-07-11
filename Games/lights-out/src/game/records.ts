import { createRecordBook, type RecordBook, type RecordStorage } from "@jgengine/core/game/recordBook";

import { LEVEL_COUNT } from "./logic/campaign";

const RANDOM_FIELD = "random";

function levelField(level: number): string {
  return `l${level}`;
}

function resolveStorage(): RecordStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function buildBook(): RecordBook<string> {
  const fields: Record<string, "lower"> = { [RANDOM_FIELD]: "lower" };
  for (let level = 0; level < LEVEL_COUNT; level += 1) fields[levelField(level)] = "lower";
  return createRecordBook<string>({ key: "lights-out:bests", fields, storage: resolveStorage() });
}

const book = buildBook();

export function levelBest(level: number): number | null {
  return book.bestOf(levelField(level));
}

export function allLevelBests(): (number | null)[] {
  const bests: (number | null)[] = [];
  for (let level = 0; level < LEVEL_COUNT; level += 1) bests.push(book.bestOf(levelField(level)));
  return bests;
}

export function submitLevel(level: number, presses: number): boolean {
  return book.submit({ [levelField(level)]: presses }).improved.length > 0;
}

export function randomBest(): number | null {
  return book.bestOf(RANDOM_FIELD);
}

export function submitRandom(presses: number): boolean {
  return book.submit({ [RANDOM_FIELD]: presses }).improved.length > 0;
}
