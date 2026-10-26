/** Validated integer quantity or a stable input rejection. */
export type QuantityResult = { ok: true; quantity: number } | { ok: false; reason: "invalid-quantity" };

/** Read an untrusted whole-item quantity without coercion, truncation, or clamping.
 * @capability command-quantity validate bounded whole-item counts at command boundaries
 */
export function readQuantity(value: unknown, options: { min?: number; max?: number } = {}): QuantityResult {
  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max < min) {
    throw new RangeError("Quantity bounds must be nonnegative safe integers in order");
  }
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max
    ? { ok: true, quantity: value }
    : { ok: false, reason: "invalid-quantity" };
}

/** Narrow an untrusted value to a plain object, rejecting arrays and null. */
export function isInputRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a non-empty string of at most `maxLength` characters, or `null`. */
export function readInputString(value: unknown, options: { maxLength?: number } = {}): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= (options.maxLength ?? 256) ? value : null;
}

/**
 * Read a finite number inside `[min, max]`, or `null`. `NaN` and `±Infinity` are always rejected, so a
 * coordinate can never drive an unbounded loop; `integer` also rejects fractions instead of flooring them.
 * @capability command-number validate finite, bounded numbers and integers at command boundaries
 */
export function readInputNumber(
  value: unknown,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (options.integer === true && !Number.isSafeInteger(value)) return null;
  if (value < (options.min ?? -Number.MAX_VALUE) || value > (options.max ?? Number.MAX_VALUE)) return null;
  return value;
}

/** Read one of a fixed set of values, or `null`. */
export function readInputOneOf<const T extends string | number>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/** Read an `{ x, y, z }` point whose axes are finite and within `maxAbs`, or `null`. */
export function readInputPoint3(
  value: unknown,
  options: { maxAbs?: number } = {},
): { x: number; y: number; z: number } | null {
  if (!isInputRecord(value)) return null;
  const bound = { min: -(options.maxAbs ?? Number.MAX_VALUE), max: options.maxAbs ?? Number.MAX_VALUE };
  const x = readInputNumber(value.x, bound);
  const y = readInputNumber(value.y, bound);
  const z = readInputNumber(value.z, bound);
  return x === null || y === null || z === null ? null : { x, y, z };
}

/** Read an `{ x, z }` ground point whose axes are finite and within `maxAbs`, or `null`. */
export function readInputPoint2(value: unknown, options: { maxAbs?: number } = {}): { x: number; z: number } | null {
  if (!isInputRecord(value)) return null;
  const bound = { min: -(options.maxAbs ?? Number.MAX_VALUE), max: options.maxAbs ?? Number.MAX_VALUE };
  const x = readInputNumber(value.x, bound);
  const z = readInputNumber(value.z, bound);
  return x === null || z === null ? null : { x, z };
}

/** Read an array of at most `maxItems` entries, each accepted by `readItem`; any rejected entry rejects the whole array. */
export function readInputArray<T>(
  value: unknown,
  readItem: (item: unknown) => T | null,
  options: { maxItems?: number } = {},
): T[] | null {
  if (!Array.isArray(value) || value.length > (options.maxItems ?? 256)) return null;
  const items: T[] = [];
  for (const entry of value) {
    const item = readItem(entry);
    if (item === null) return null;
    items.push(item);
  }
  return items;
}
