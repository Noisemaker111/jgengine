/**
 * Typed reads of an authored object's free-form `meta` (a marker's `grid`, a spawn's `enemy`): the
 * scene file is JSON a person edits, so a wrong value fails here naming the object and the key,
 * instead of reaching the game as `NaN` or the text "undefined".
 */

/** Any authored object that carries `meta`: a marker, volume, path or catalog entry. */
export interface WithMeta {
  readonly id: string;
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
}

function metaValue(item: WithMeta, key: string): unknown {
  return item.meta?.[key];
}

function wrongValue(item: WithMeta, key: string, wanted: string, value: unknown): Error {
  return new Error(`${item.id}: meta.${key} must be ${wanted}, not ${JSON.stringify(value)}`);
}

/**
 * The number `meta[key]` holds (a JSON number, or text that reads as one), or `fallback` when the
 * scene leaves the key out. Any other value fails.
 *
 * @capability editor-meta read a placed object's authored meta as a typed number or text, failing on a wrong value
 */
export function metaNumber(item: WithMeta, key: string, fallback: number): number {
  const value = metaValue(item, key);
  if (value === undefined) return fallback;
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) throw wrongValue(item, key, "a number", value);
  return number;
}

/** The text `meta[key]` holds, or `undefined` when the scene leaves the key out. A value that is not text fails. */
export function metaText(item: WithMeta, key: string): string | undefined {
  const value = metaValue(item, key);
  if (value === undefined || typeof value === "string") return value;
  throw wrongValue(item, key, "text", value);
}

/** The text `meta[key]` must hold: a missing key or a value that is not text fails. */
export function requireMetaText(item: WithMeta, key: string): string {
  const value = metaText(item, key);
  if (value === undefined) throw wrongValue(item, key, "text", value);
  return value;
}
