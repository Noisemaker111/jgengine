import {
  createRecordBook,
  type RecordBook,
  type RecordStorage,
} from "@jgengine/core/game/recordBook";
import { PUZZLES } from "../puzzles/catalog";

function storage(): RecordStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage as unknown as RecordStorage;
  } catch {
    return null;
  }
}

let book: RecordBook<string> | null = null;
function getBook(): RecordBook<string> {
  if (book === null) {
    const fields: Record<string, "lower"> = {};
    for (const p of PUZZLES) fields[p.id] = "lower";
    book = createRecordBook<string>({
      key: "nonogram:best-times",
      fields,
      storage: storage(),
    });
  }
  return book;
}

const COMPLETED_KEY = "nonogram:completed";

// Monotonic personal-best solve time per puzzle (lower is better).
export function bestOf(id: string): number | null {
  return getBook().bestOf(id);
}

export function allBests(): Readonly<Partial<Record<string, number>>> {
  return getBook().best();
}

export function submitTime(id: string, ms: number): boolean {
  return getBook().submit({ [id]: ms }).improved.includes(id);
}

// Completion is a mutable, non-numeric set — RecordStorage directly, never the
// monotonic record book.
export function completedIds(): string[] {
  try {
    const raw = storage()?.getItem(COMPLETED_KEY) ?? null;
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markCompleted(id: string): string[] {
  const current = completedIds();
  if (current.includes(id)) return current;
  const next = [...current, id];
  try {
    storage()?.setItem(COMPLETED_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — keep the in-session mirror */
  }
  return next;
}

export function clearProgress(): void {
  getBook().clear();
  try {
    storage()?.removeItem(COMPLETED_KEY);
  } catch {
    /* ignore */
  }
}
