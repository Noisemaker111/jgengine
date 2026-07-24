/**
 * Pure, serialization-friendly numeric operations over a caller-owned record of
 * keyed values, plus delimiter-safe pair-key codecs for directed and undirected
 * relations.
 *
 * No hidden state and no social semantics: the record, its bounds, drift rates,
 * and keys are all caller data. Operations **mutate the passed record in place**
 * and return the resulting value, so a game keeps one plain `Record<string, number>`
 * it can serialize with `JSON.stringify` and restore verbatim. Pair keys are the
 * injectable canonicalizer — compose `codec.key(a, b)` into any of the ops below.
 *
 * **Ownership tier (sdk #1320):** this is the *mutable record* tier — not the
 * immutable wallet (`grant`/`charge` → new state + `{status}`) or the pure
 * pool (`adjustStatPool` → change object) or the adapter pool
 * (`applyStatPoolDelta` → `{status}`). Prefer wallet/stat-pool when you need
 * immutable or adapter ownership; use keyedValues when a single mutable
 * `Record` is the source of truth (relationships, soft counters).
 */
import { clamp, moveTowards } from "../math/scalar";

/** Optional inclusive `[min, max]` clamp applied after a write. Omit an edge for unbounded. */
export interface NumericBounds {
  readonly min?: number;
  readonly max?: number;
}

function applyBounds(value: number, bounds?: NumericBounds): number {
  return clamp(value, bounds?.min ?? Number.NEGATIVE_INFINITY, bounds?.max ?? Number.POSITIVE_INFINITY);
}

/** Clamp a scalar to `bounds` (identity when `bounds` is omitted). Pure — touches no record. */
export function clampValue(value: number, bounds?: NumericBounds): number {
  return applyBounds(value, bounds);
}

/** Current value for `key`, or `fallback` (default `0`) when the record has no entry. */
export function getValue(record: Record<string, number>, key: string, fallback = 0): number {
  const stored = record[key];
  return stored === undefined ? fallback : stored;
}

/**
 * Set `key` to `value` (clamped to `bounds`), writing the record in place. Returns the stored value.
 *
 * @capability set a bounded keyed value in a caller-owned serializable record
 */
export function setValue(
  record: Record<string, number>,
  key: string,
  value: number,
  bounds?: NumericBounds,
): number {
  const next = applyBounds(value, bounds);
  record[key] = next;
  return next;
}

/** Add `delta` to `key` (clamped to `bounds`), writing the record in place. Returns the stored value. */
export function addValue(
  record: Record<string, number>,
  key: string,
  delta: number,
  bounds?: NumericBounds,
): number {
  return setValue(record, key, getValue(record, key) + delta, bounds);
}

/**
 * Step `key` toward `target` by at most `maxDelta` without overshooting, then clamp
 * to `bounds`. Writes in place and returns the stored value.
 *
 * @capability move a keyed value toward a target by a bounded step
 */
export function towardValue(
  record: Record<string, number>,
  key: string,
  target: number,
  maxDelta: number,
  bounds?: NumericBounds,
): number {
  const step = maxDelta > 0 ? maxDelta : 0;
  return setValue(record, key, moveTowards(getValue(record, key), target, step), bounds);
}

/**
 * Decay `key` toward a `rest` value (default `0`) by `rate` per call — the common
 * "relationships cool off" / "heat fades" drift. Thin wrapper over {@link towardValue}.
 */
export function driftValue(
  record: Record<string, number>,
  key: string,
  rate: number,
  rest = 0,
  bounds?: NumericBounds,
): number {
  return towardValue(record, key, rest, rate, bounds);
}

/** Canonicalizes a two-part relation identity into a single delimiter-safe record key. */
export interface PairKeyCodec {
  /** `true` when order matters (a→b differs from b→a); `false` sorts the pair first. */
  readonly directed: boolean;
  /** Encode a pair into one record key. Undirected codecs canonicalize by sorting the two ids. */
  key(a: string, b: string): string;
  /** Recover the pair from a key. Undirected keys come back in canonical (sorted) order. */
  parse(key: string): [string, string];
}

/** Direction and delimiter policy for {@link createPairKeyCodec}. */
export interface PairKeyOptions {
  /** `true` for ordered relations (rivalry-from, owes-to); default `false` (mutual). */
  readonly directed?: boolean;
  /** Single-character delimiter between encoded ids (default `"|"`). Collisions are escaped, not forbidden. */
  readonly separator?: string;
}

const ESCAPE = "\\";

function escapeComponent(value: string, separator: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === ESCAPE || ch === separator) out += ESCAPE;
    out += ch;
  }
  return out;
}

function splitEscaped(key: string, separator: string): [string, string] {
  const parts: string[] = [];
  let current = "";
  let escaped = false;
  for (const ch of key) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (ch === ESCAPE) {
      escaped = true;
    } else if (ch === separator) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return [parts[0] ?? "", parts[1] ?? ""];
}

/**
 * Build a pair-key codec for keyed relation values. Ids are escaped before joining,
 * so any id (including ones containing the separator or a backslash) round-trips
 * through {@link PairKeyCodec.key} → {@link PairKeyCodec.parse} without collision.
 * Undirected codecs (the default) canonicalize so `key(a, b) === key(b, a)`.
 *
 * @capability build a serializable directed/undirected pair key that resists delimiter collisions
 */
export function createPairKeyCodec(options: PairKeyOptions = {}): PairKeyCodec {
  const directed = options.directed ?? false;
  const separator = options.separator ?? "|";
  if (separator.length !== 1) {
    throw new Error(`pair-key separator must be a single character, got ${JSON.stringify(separator)}`);
  }
  if (separator === ESCAPE) throw new Error("pair-key separator cannot be the escape character '\\'");
  return {
    directed,
    key(a, b) {
      const [first, second] = directed || a <= b ? [a, b] : [b, a];
      return `${escapeComponent(first, separator)}${separator}${escapeComponent(second, separator)}`;
    },
    parse(key) {
      return splitEscaped(key, separator);
    },
  };
}
