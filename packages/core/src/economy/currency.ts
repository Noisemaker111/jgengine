export interface CurrencyDefinition<TCurrencyId extends string = string> {
  id: TCurrencyId;
  name: string;
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
export function sanitizeCurrencyAmount(amount: number): number {
  return Math.max(0, Math.floor(amount));
}

/**
 * Format a currency amount with its symbol and grouping for HUD display.
 *
 * @capability currency-format format a currency amount with its symbol for display
  * @internal
  */
export function formatCurrencyAmount(currency: CurrencyDefinition, amount: number): string {
  const prefix = currency.symbol ?? "";
  const suffix = currency.unit ? ` ${currency.unit}` : "";
  return `${prefix}${amount}${suffix}`;
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
  const safeAmount = sanitizeCurrencyAmount(amount);
  if (safeAmount === 0) return { success: true, newBalance: current, appliedDelta: 0 };
  if (operation === "deduct" && current < safeAmount) {
    return { success: false, reason: insufficientCurrencyReason(currency, safeAmount, current) };
  }
  const appliedDelta = operation === "add" ? safeAmount : -safeAmount;
  return { success: true, newBalance: current + appliedDelta, appliedDelta };
}

/** Deducts clamp to the available balance (a delta can never overdraw); adds apply in full.
 * @internal
 */
export function resolveCurrencyDelta(
  current: number,
  delta: number,
): { operation: CurrencyOperation; amount: number } {
  const safeDelta = Math.floor(delta);
  if (safeDelta > 0) return { operation: "add", amount: safeDelta };
  return { operation: "deduct", amount: Math.min(Math.abs(safeDelta), current) };
}
