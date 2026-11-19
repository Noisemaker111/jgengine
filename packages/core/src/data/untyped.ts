/**
 * Reading a value whose shape is not known yet: parsed JSON, a save from an older build, a message off
 * the wire. Narrow it with these instead of casting, read its fields with brackets, and build the
 * typed value from the pieces that checked out.
 *
 * @capability untyped-read narrow parsed JSON, old saves and other unknown values to records and typed maps without casts
 */

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True for a number that is not NaN or infinite. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function typedRecord<T>(value: unknown, entry: (item: unknown) => item is T): Record<string, T> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, T> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!entry(item)) return null;
    out[key] = item;
  }
  return out;
}
