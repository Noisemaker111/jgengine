export interface RunRecords {
  attempts: number;
  escapes: number;
  bestTime: number | null;
  farthest: number;
}

export const RECORDS_KEY = "drift-foundry.records.v1";
export const EMPTY_RECORDS: RunRecords = { attempts: 0, escapes: 0, bestTime: null, farthest: 0 };
export interface RecordStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export interface CompletedRun { kind: "won" | "crushed"; time: number; distance: number }
export type PersonalBest = "first" | "improved" | "tied" | "unchanged";

/** Only a completed escape sets a time record; displayed ties use millisecond precision. */
export function completeRun(records: RunRecords, run: CompletedRun): { records: RunRecords; personalBest: PersonalBest } {
  if (!Number.isFinite(run.time) || run.time <= 0 || !Number.isFinite(run.distance)) {
    return { records, personalBest: "unchanged" };
  }
  const time = Math.round(run.time * 1000) / 1000;
  const next = { ...records, attempts: records.attempts + 1, farthest: Math.max(records.farthest, Math.max(0, run.distance)) };
  let personalBest: PersonalBest = "unchanged";
  if (run.kind === "won") {
    next.escapes += 1;
    const previous = records.bestTime === null ? null : Math.round(records.bestTime * 1000) / 1000;
    personalBest = previous === null ? "first" : time < previous ? "improved" : time === previous ? "tied" : "unchanged";
    if (previous === null || time < previous) next.bestTime = time;
  }
  return { records: next, personalBest };
}

export function readRecords(storage?: RecordStorage): RunRecords {
  try {
    const data = JSON.parse(storage?.getItem(RECORDS_KEY) ?? "null");
    if (!data || typeof data !== "object") return { ...EMPTY_RECORDS };
    const nonnegative = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
    return {
      attempts: nonnegative(data.attempts) ? Math.floor(data.attempts) : 0,
      escapes: nonnegative(data.escapes) ? Math.floor(data.escapes) : 0,
      bestTime: nonnegative(data.bestTime) && data.bestTime > 0 ? data.bestTime : null,
      farthest: nonnegative(data.farthest) ? data.farthest : 0,
    };
  } catch { return { ...EMPTY_RECORDS }; }
}

export function saveRecords(records: RunRecords, storage?: RecordStorage): boolean {
  if (!storage) return false;
  try { storage.setItem(RECORDS_KEY, JSON.stringify(records)); return true; }
  catch { return false; }
}

export function browserRecordStorage(): RecordStorage | undefined {
  try { return typeof localStorage === "undefined" ? undefined : localStorage; }
  catch { return undefined; }
}
