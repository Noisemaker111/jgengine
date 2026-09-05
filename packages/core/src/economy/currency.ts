export interface CurrencyDefinition<TCurrencyId extends string = string> {
  id: TCurrencyId;
  name: string;
  /** Fractional digits in major-unit amounts; defaults to 0. */
  decimals?: number;
  /** Prepended when formatting amounts (e.g. "$"). */
  symbol?: string;
  /** Appended when formatting amounts (e.g. "tokens"). */
  unit?: string;
}

export type CurrencyOperation = "add" | "deduct";

export type CurrencyAdjustment =
  | { success: true; newBalance: number; appliedDelta: number }
  | { success: false; reason: string };

/** @internal */
export function sanitizeCurrencyAmount(amount: number, currency?: CurrencyDefinition): number {
  if (!Number.isFinite(amount)) throw new RangeError("Currency amount must be finite");
  return fromMinorUnits(currency, toMinorUnits(currency, Math.max(0, amount)));
}

function currencyScale(currency?: Pick<CurrencyDefinition, "decimals">): number {
  const decimals = currency?.decimals ?? 0;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new RangeError("Currency decimals must be an integer between 0 and 9");
  }
  return 10 ** decimals;
}

/** Convert major units to integer minor units, rounding once at the write boundary.
 * @capability currency-minor-units round decimal currency into safe integer minor units
 */
export function toMinorUnits(currency: Pick<CurrencyDefinition, "decimals"> | undefined, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("Currency amount must be finite");
  const scaled = value * currencyScale(currency);
  const result = Math.sign(scaled) * Math.round(Math.abs(scaled) + Math.min(1e-7, Number.EPSILON * Math.abs(scaled)));
  if (!Number.isSafeInteger(result)) throw new RangeError("Currency amount exceeds safe integer precision");
  return result;
}

/** Convert stored integer minor units to major units for display or existing balance records.
 * @capability currency-major-units convert safe minor-unit integers into currency amounts
 */
export function fromMinorUnits(currency: Pick<CurrencyDefinition, "decimals"> | undefined, value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError("Minor units must be a safe integer");
  return value / currencyScale(currency);
}

/** Format a major-unit value using the currency's declared precision.
 * @capability currency-precision-format display a currency using its declared decimal precision
 */
export function formatCurrency(currency: CurrencyDefinition, value: number): string {
  const decimals = currency.decimals ?? 0;
  const rounded = fromMinorUnits(currency, toMinorUnits(currency, value));
  return `${currency.symbol ?? ""}${rounded.toFixed(decimals)}${currency.unit ? ` ${currency.unit}` : ""}`;
}

/**
 * Format a currency amount with its symbol and grouping for HUD display.
 *
 * @capability currency-format format a currency amount with its symbol for display
  * @internal
  */
export function formatCurrencyAmount(currency: CurrencyDefinition, amount: number): string {
  return formatCurrency(currency, amount);
}

/** @internal */
export function insufficientCurrencyReason(
  currency: CurrencyDefinition,
  needed: number,
  current: number,
): string {
  return `Insufficient ${currency.id}: need ${formatCurrencyAmount(currency, needed)}, have ${formatCurrencyAmount(currency, current)}`;
}

/** @internal */
export function applyCurrencyOperation(
  currency: CurrencyDefinition,
  current: number,
  operation: CurrencyOperation,
  amount: number,
): CurrencyAdjustment {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(current)) {
    return { success: false, reason: "Invalid currency amount" };
  }
  const currentMinor = toMinorUnits(currency, current);
  const amountMinor = toMinorUnits(currency, amount);
  if (operation === "deduct" && currentMinor < amountMinor) {
    return { success: false, reason: insufficientCurrencyReason(currency, fromMinorUnits(currency, amountMinor), current) };
  }
  const deltaMinor = operation === "add" ? amountMinor : -amountMinor;
  return {
    success: true,
    newBalance: fromMinorUnits(currency, currentMinor + deltaMinor),
    appliedDelta: fromMinorUnits(currency, deltaMinor),
  };
}

/** Deducts clamp to the available balance (a delta can never overdraw); adds apply in full.
 * @internal
 */
export function resolveCurrencyDelta(
  current: number,
  delta: number,
  currency?: CurrencyDefinition,
): { operation: CurrencyOperation; amount: number } {
  const safeDelta = fromMinorUnits(currency, toMinorUnits(currency, delta));
  if (safeDelta > 0) return { operation: "add", amount: safeDelta };
  return { operation: "deduct", amount: Math.min(Math.abs(safeDelta), current) };
}
