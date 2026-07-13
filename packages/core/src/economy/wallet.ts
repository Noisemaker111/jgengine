export interface WalletState {
  balances: Readonly<Record<string, number>>;
}

export type ChargeResult = { status: "ok"; state: WalletState } | { status: "rejected"; reason: "insufficient-funds" };

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

export function charge(state: WalletState, currency: string, amount: number): ChargeResult {
  assertValidAmount(amount);
  const current = balance(state, currency);
  if (current < amount) {
    return { status: "rejected", reason: "insufficient-funds" };
  }
  return {
    status: "ok",
    state: {
      balances: {
        ...state.balances,
        [currency]: current - amount,
      },
    },
  };
}

export function canAfford(state: WalletState, costs: Readonly<Record<string, number>>): boolean {
  return Object.entries(costs).every(([currency, amount]) => balance(state, currency) >= amount);
}

export function chargeAll(state: WalletState, costs: Readonly<Record<string, number>>): ChargeResult {
  if (!canAfford(state, costs)) {
    return { status: "rejected", reason: "insufficient-funds" };
  }
  const balances = { ...state.balances };
  for (const [currency, amount] of Object.entries(costs)) {
    balances[currency] = balance(state, currency) - amount;
  }
  return { status: "ok", state: { balances } };
}
