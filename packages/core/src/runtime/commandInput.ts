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
