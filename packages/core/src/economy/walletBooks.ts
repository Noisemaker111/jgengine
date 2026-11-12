import {
  createTransactionLedger,
  type LedgerEntry,
  type LedgerEntryFilter,
  type LedgerState,
  type LedgerTotals,
  type TransactionLedger,
  type TransactionLedgerOptions,
} from "./transactionLedger";

/** Options for {@link createWalletBooks}. */
export interface WalletBooksOptions {
  /** The account the journal keeps, usually the player's user id or a faction id. */
  account: string;
  /** Every currency the journal follows. */
  currencies: readonly string[];
  /** The live balance the journal explains: a wallet, a world fact. Whole units only. */
  balance(currency: string): number;
  /** Caller clock in seconds, stamped on each entry. */
  now(): number;
  /** Reason for a difference the journal did not see happen, such as a host write (default `"reconcile"`). */
  unexplained?: string;
  /**
   * How a fresh journal opens. Without it each account opens at the live balance and no entry
   * explains it; with it the accounts open at zero and the live balance posts under this reason,
   * so the history alone explains the whole balance.
   */
  opening?: string;
  /** Options for the underlying {@link TransactionLedger}. */
  ledger?: TransactionLedgerOptions;
}

/**
 * A reason-tagged journal kept square to a balance something else owns. The wallet or world fact
 * stays the balance the game, HUD and save read; every movement is posted here with why it
 * happened, so the books explain the balance instead of a bare number changing.
 */
export interface WalletBooks {
  readonly ledger: TransactionLedger;
  /**
   * Post a movement that already happened in the source. A difference the journal had not seen
   * before it posts first under the `unexplained` reason, so only `delta` lands under `reason`.
   */
  record(currency: string, delta: number, reason: string, ref?: string): void;
  /** Run a mutation of the source and post what it moved in each currency under `reason`. */
  track<T>(reason: string, mutate: () => T, ref?: string): T;
  /** Post any difference between the journal and the live source under `reason` (default `unexplained`). */
  square(reason?: string, ref?: string): void;
  /** Source minus journal per currency; every value is `0` while the books explain the balance. */
  unexplained(): Record<string, number>;
  /** The journal's balance in one currency. */
  balanceOf(currency: string): number;
  entries(filter?: Omit<LedgerEntryFilter, "account">): LedgerEntry[];
  totals(): Record<string, LedgerTotals>;
  snapshot(): LedgerState;
  /** Restore a saved journal and square it to the live source under `reason`. `false` leaves the books untouched. */
  restore(state: LedgerState, reason?: string): boolean;
  /** Clear the journal and reopen it at the live source; `opening` posts that balance under its own reason. */
  reset(opening?: string): void;
  dispose(): void;
}

/**
 * Keep a {@link TransactionLedger} as the journal over a balance the game already owns — the engine
 * wallet, a world-model fact. `record` and `track` post each movement with its reason, and any
 * difference the journal did not see (a load, a host write) is posted under a named reason instead of
 * silently drifting, so the history always explains the live balance.
 *
 * @capability wallet-books journal every movement of a wallet or world-fact balance with its reason, kept square to the live balance
 */
export function createWalletBooks(options: WalletBooksOptions): WalletBooks {
  const { account, currencies } = options;
  const unexplainedReason = options.unexplained ?? "reconcile";
  const ledger = createTransactionLedger(options.ledger);

  function post(currency: string, amount: number, reason: string, ref: string | undefined): void {
    if (amount === 0) return;
    ledger.post({
      account,
      currency,
      amount,
      reason,
      at: Math.max(0, options.now()),
      ...(ref === undefined ? {} : { ref }),
      overdraft: true,
    });
  }

  function open(opening: string | undefined): void {
    for (const currency of currencies) ledger.openAccount(account, currency, opening === undefined ? options.balance(currency) : 0);
    if (opening !== undefined) for (const currency of currencies) post(currency, options.balance(currency), opening, undefined);
  }

  function squareCurrency(currency: string, reason: string, ref: string | undefined, pending = 0): void {
    post(currency, options.balance(currency) - pending - ledger.balanceOf(account, currency), reason, ref);
  }

  open(options.opening);

  return {
    ledger,
    record(currency, delta, reason, ref) {
      if (delta === 0) return;
      squareCurrency(currency, unexplainedReason, undefined, delta);
      post(currency, delta, reason, ref);
    },
    track(reason, mutate, ref) {
      const before = currencies.map((currency) => {
        squareCurrency(currency, unexplainedReason, undefined);
        return options.balance(currency);
      });
      const result = mutate();
      currencies.forEach((currency, index) => post(currency, options.balance(currency) - before[index]!, reason, ref));
      return result;
    },
    square(reason = unexplainedReason, ref) {
      for (const currency of currencies) squareCurrency(currency, reason, ref);
    },
    unexplained() {
      return Object.fromEntries(currencies.map((currency) => [currency, options.balance(currency) - ledger.balanceOf(account, currency)]));
    },
    balanceOf: (currency) => ledger.balanceOf(account, currency),
    entries: (filter = {}) => ledger.entries({ ...filter, account }),
    totals: () => ledger.totals(),
    snapshot: () => ledger.snapshot(),
    restore(state, reason = unexplainedReason) {
      if (!ledger.restore(state)) return false;
      for (const currency of currencies) ledger.openAccount(account, currency, 0);
      for (const currency of currencies) squareCurrency(currency, reason, undefined);
      return true;
    },
    reset(opening) {
      ledger.reset();
      open(opening);
    },
    dispose: () => ledger.dispose(),
  };
}
