// @skill jgengine-gameplay
/**
 * Pure, serialization-friendly numeric operations over a caller-owned record of
 * keyed values, plus delimiter-safe pair-key codecs for directed and undirected
 * relations.
 *
 * No hidden state and no social semantics: the record, its bounds, drift rates,
 * and keys are all caller data. Operations mutate the passed record in place and
 * return the resulting value, so a game keeps one plain `Record<string, number>`
 * it can serialize with `JSON.stringify` and restore verbatim. Pair keys are the
 * injectable canonicalizer — compose `codec.key(a, b)` into any of the ops below.
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

/** @capability move a keyed value toward a target by a bounded step */
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

export interface PairKeyCodec {
  /** `true` when order matters (a→b differs from b→a); `false` sorts the pair first. */
  readonly directed: boolean;
  key(a: string, b: string): string;
  parse(key: string): [string, string];
}

export interface PairKeyOptions {
  readonly directed?: boolean;
  readonly separator?: string;
}

const ESCAPE = "\\";

function escapeComponent(value: string, separator: string): string {
  // Ids rarely hold the separator or the escape: those need no copy.
  if (value.indexOf(separator) < 0 && value.indexOf(ESCAPE) < 0) return value;
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

/** @capability build a serializable directed/undirected pair key that resists delimiter collisions */
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
      const inOrder = directed || a <= b;
      const first = inOrder ? a : b;
      const second = inOrder ? b : a;
      return `${escapeComponent(first, separator)}${separator}${escapeComponent(second, separator)}`;
    },
    parse(key) {
      return splitEscaped(key, separator);
    },
  };
}
