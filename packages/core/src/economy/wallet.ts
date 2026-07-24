export interface WalletState {
  balances: Readonly<Record<string, number>>;
}

/**
 * Outcome of a {@link charge}/{@link chargeAll} attempt: `status: "ok"` carries the debited
 * {@link WalletState}, while `status: "rejected"` leaves the wallet untouched and reports why
 * (currently only `"insufficient-funds"`). Discriminate on `status` before reading `state`.
 *
 * **Result convention (sdk #1320):** adapter/state-machine write paths use `status: "ok"|"rejected"`.
 * Pure pool deltas use the change object from {@link adjustStatPool} without a status envelope.
 */
export type ChargeResult = { status: "ok"; state: WalletState } | { status: "rejected"; reason: "insufficient-funds" };

/**
 * Opt-in debt affordance for {@link charge}/{@link chargeAll}: `true` allows the balance to go
 * arbitrarily negative, a number caps how far into the red it may go (the charge is rejected once
 * `balance - amount` would fall below `-max`). Omitted (the default) keeps the strict no-debt rule.
 */
export type Overdraft = boolean | { max: number };

/** Options for {@link charge}/{@link chargeAll}: opt one call into overdraft debt via `overdraft`. */
export interface ChargeOptions {
  overdraft?: Overdraft;
}

/**
 * Hold per-currency balances with affordability checks and charge/grant operations.
 *
 * @capability wallet hold currency balances with charge and affordability checks
 */
export function createEmptyWallet(): WalletState {
  return { balances: {} };
}

function assertValidAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError(`amount must be a positive finite number, got ${amount}`);
  }
}

export function balance(state: WalletState, currency: string): number {
  return state.balances[currency] ?? 0;
}

export function grant(state: WalletState, currency: string, amount: number): WalletState {
  assertValidAmount(amount);
  return {
    balances: {
      ...state.balances,
      [currency]: balance(state, currency) + amount,
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
  currency: string,
  amount: number,
  options?: ChargeOptions,
): ChargeResult {
  assertValidAmount(amount);
  const current = balance(state, currency);
  const next = current - amount;
  if (!withinOverdraft(next, options?.overdraft)) {
    return { status: "rejected", reason: "insufficient-funds" };
  }
  return {
    status: "ok",
    state: {
      balances: {
        ...state.balances,
        [currency]: next,
      },
    },
  };
}

/** True once `balance(state, currency)` has gone negative under an overdraft-enabled charge. */
export function isOverdrawn(state: WalletState, currency: string): boolean {
  return balance(state, currency) < 0;
}

/** True when every currency in `costs` has at least that much balance (a pure, non-mutating check). */
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
