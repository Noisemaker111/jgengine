import { fromMinorUnits, toMinorUnits, type CurrencyDefinition } from "./currency";

export interface WalletState {
  balances: Readonly<Record<string, number>>;
}

/**
 * Outcome of a {@link charge}/{@link chargeAll} attempt: `status: "ok"` carries the debited
 * {@link WalletState}, while `status: "rejected"` leaves the wallet untouched and reports why
 * (currently only `"insufficient-funds"`). Discriminate on `status` before reading `state`.
 */
export type ChargeResult = { status: "ok"; state: WalletState } | { status: "rejected"; reason: "insufficient-funds" };

export type Overdraft = boolean | { max: number };

export interface ChargeOptions {
  overdraft?: Overdraft;
}

/** @capability wallet hold currency balances with charge and affordability checks */
export function createEmptyWallet(): WalletState {
  return { balances: {} };
}

function assertValidAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError(`amount must be a positive finite number, got ${amount}`);
  }
}

export function balance(state: WalletState, currency: string | CurrencyDefinition): number {
  return state.balances[typeof currency === "string" ? currency : currency.id] ?? 0;
}

export function grant(state: WalletState, currency: string | CurrencyDefinition, amount: number): WalletState {
  assertValidAmount(amount);
  return {
    balances: {
      ...state.balances,
      [typeof currency === "string" ? currency : currency.id]: typeof currency === "string"
        ? balance(state, currency) + amount
        : fromMinorUnits(currency, toMinorUnits(currency, balance(state, currency)) + toMinorUnits(currency, amount)),
    },
  };
}

function withinOverdraft(nextBalance: number, overdraft: Overdraft | undefined): boolean {
  if (nextBalance >= 0) return true;
  if (overdraft === undefined || overdraft === false) return false;
  if (overdraft === true) return true;
  return nextBalance >= -overdraft.max;
}

/**
 * Deduct `amount`, rejecting when it would leave the balance negative unless `options.overdraft`
 * opts into carrying debt (`true` unlimited, `{ max }` capped) — the strict same-tick affordability
 * check stays the default with `options` omitted.
 */
export function charge(
  state: WalletState,
  currency: string | CurrencyDefinition,
  amount: number,
  options?: ChargeOptions,
): ChargeResult {
  assertValidAmount(amount);
  const current = balance(state, currency);
  const next = typeof currency === "string" ? current - amount
    : fromMinorUnits(currency, toMinorUnits(currency, current) - toMinorUnits(currency, amount));
  if (!withinOverdraft(next, options?.overdraft)) {
    return { status: "rejected", reason: "insufficient-funds" };
  }
  return {
    status: "ok",
    state: {
      balances: {
        ...state.balances,
        [typeof currency === "string" ? currency : currency.id]: next,
      },
    },
  };
}

export function isOverdrawn(state: WalletState, currency: string | CurrencyDefinition): boolean {
  return balance(state, currency) < 0;
}

export function canAfford(state: WalletState, costs: Readonly<Record<string, number>>): boolean {
  return Object.entries(costs).every(([currency, amount]) => balance(state, currency) >= amount);
}

export function chargeAll(
  state: WalletState,
  costs: Readonly<Record<string, number>>,
  options?: ChargeOptions,
): ChargeResult {
  const overdraft = options?.overdraft;
  if (overdraft === undefined && !canAfford(state, costs)) {
    return { status: "rejected", reason: "insufficient-funds" };
  }
  const balances = { ...state.balances };
  for (const [currency, amount] of Object.entries(costs)) {
    const next = balance(state, currency) - amount;
    if (!withinOverdraft(next, overdraft)) {
      return { status: "rejected", reason: "insufficient-funds" };
    }
    balances[currency] = next;
  }
  return { status: "ok", state: { balances } };
}
