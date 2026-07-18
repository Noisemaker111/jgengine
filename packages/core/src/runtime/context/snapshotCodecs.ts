/**
 * Shallow wire codecs for {@link SnapshotModule.decode} — reject obviously wrong shapes so hydrate
 * never receives bare casts of garbage. Fail soft (return `null`); deeper field validation stays with
 * each subsystem's hydrate.
 * @internal
 */

export function decodeArray<T = unknown>(raw: unknown): T[] | null {
  return Array.isArray(raw) ? (raw as T[]) : null;
}

export function decodeRecord<T = unknown>(raw: unknown): Record<string, T> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, T>;
}

export function decodeEntries<T = unknown>(
  raw: unknown,
): readonly (readonly [string, T])[] | null {
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2 || typeof entry[0] !== "string") return null;
  }
  return raw as readonly (readonly [string, T])[];
}
