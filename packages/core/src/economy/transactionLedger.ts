import { devtools } from "../devtools/devtools";

/**
 * Money in this module is an integer count of **minor units** — cents when the currency has two
 * decimals, whole coins when it has none. Every posted amount and every balance is a safe integer,
 * so a long simulation never accumulates float drift. `currency` is a free string the game owns.
 */

/**
 * One recorded movement of money. Every post keeps the balance it produced and the reason it
 * happened, so a summary or a post-mortem reads the books rather than reconstructing them.
 */
export interface LedgerEntry {
  /** 1-based, monotonic within the ledger. */
  seq: number;
  /** Caller clock, in seconds. */
  at: number;
  account: string;
  currency: string;
  /** Signed integer minor units; negative debits the account, positive credits it. */
  amount: number;
  /** The account's balance in this currency after the entry was applied. */
  balanceAfter: number;
  /** Caller-owned reason code — `"sale"`, `"upkeep"`, `"loan-interest"`. Never interpreted here. */
  reason: string;
  /** Optional id of what caused the entry — a good, an order, a loan. */
  ref?: string;
}

/** A post to attempt. */
export interface LedgerPostInput {
  at: number;
  account: string;
  currency: string;
  /** Signed integer minor units. */
  amount: number;
  reason: string;
  ref?: string;
  /** `true` allows any negative balance, `{ max }` caps how far into the red the post may go. */
  overdraft?: boolean | { max: number };
}

/** Outcome of {@link TransactionLedger.post}. A rejection leaves every balance untouched. */
export type LedgerPostResult =
  | { ok: true; entry: LedgerEntry }
  | { ok: false; reason: "unknown-account" | "invalid-amount" | "invalid-reason" | "insufficient-funds" };

/** A recurring charge — upkeep, rent, a subscription — settled by {@link TransactionLedger.chargeDue}. */
export interface RecurringCharge {
  /** Stable id, unique within the ledger. */
  id: string;
  account: string;
  currency: string;
  /** Positive integer minor units charged each cadence. */
  amountPerPeriod: number;
  /** Cadence in seconds; must be `> 0`. */
  everySeconds: number;
  /** First due time in seconds; defaults to the ledger clock when the charge is added. */
  startSeconds?: number;
  reason: string;
  ref?: string;
  /** How cycles that came due between two advances are settled: `"each"` (default), `"sum"`, `"skip"`. */
  catchUp?: "each" | "sum" | "skip";
  /** Due cycles beyond this in one advance are dropped rather than settled. */
  maxCatchUp?: number;
}

/** Mutable per-charge progress, kept apart from the {@link RecurringCharge} definition. */
export interface ChargeCursor {
  nextDueSeconds: number;
  fired: number;
  /** Cycles that came due and could not be settled for lack of funds. */
  missed: number;
  done: boolean;
}

/** What one reason code did to the books, kept across entry trimming. */
export interface LedgerTotals {
  count: number;
  /** Sum of the signed amounts posted under this reason, in minor units. */
  net: number;
}

/** Counters of a ledger, for a probe or a summary line. */
export interface LedgerStats {
  accounts: number;
  entries: number;
  charges: number;
  seq: number;
}

/** Fully serializable ledger state: clock, balances, journal, totals, charges and cursors. */
export interface LedgerState {
  nowSeconds: number;
  accounts: Record<string, Record<string, number>>;
  entries: readonly LedgerEntry[];
  totals: Record<string, LedgerTotals>;
  charges: Record<string, RecurringCharge>;
  cursors: Record<string, ChargeCursor>;
  seq: number;
}

/** What one {@link TransactionLedger.chargeDue} settled, and what it could not. */
export interface LedgerAdvanceResult {
  charged: readonly LedgerEntry[];
  /** Charges that came due with no funds, and how many cycles were missed. */
  missed: readonly { id: string; cycles: number }[];
}

/** A filter over the journal. */
export interface LedgerEntryFilter {
  account?: string;
  reason?: string;
  /** Only entries at or after this time. */
  since?: number;
  /** Keep at most this many of the most recent matches. */
  limit?: number;
}

/** Options for {@link createTransactionLedger}. */
export interface TransactionLedgerOptions {
  /** Journal entries retained; older ones drop and live on in {@link LedgerTotals} (default `1024`). */
  maxEntries?: number;
  /** Safety bound on cycles settled per charge per advance (default `256`). */
  maxCyclesPerAdvance?: number;
  /** Register a devtools probe under this name reporting {@link LedgerStats} and per-reason totals. */
  devtoolsName?: string;
}

/** The books: balances with a reason-tagged journal, and recurring charges on a cadence. */
export interface TransactionLedger {
  /** Create an account/currency pair, or add a currency to an existing account. An existing balance is kept. */
  openAccount(account: string, currency: string, initial?: number): void;
  balanceOf(account: string, currency: string): number;
  /** Record one movement of money. Rejected without mutation when the account is unknown, the amount unusable, or funds are short. */
  post(input: LedgerPostInput): LedgerPostResult;
  /** Register a recurring charge. `false` for a duplicate id or unusable terms. */
  addCharge(charge: RecurringCharge): boolean;
  /** Remove a recurring charge and its cursor. `false` if it was not registered. */
  removeCharge(id: string): boolean;
  /** Advance the clock, settling every charge due at or before `nowSeconds` in sorted-id order. */
  chargeDue(nowSeconds: number): LedgerAdvanceResult;
  /** Journal entries, newest last, filtered and capped. Copies, safe to retain. */
  entries(filter?: LedgerEntryFilter): LedgerEntry[];
  /** Per-reason counts and net amounts over the ledger's whole life. */
  totals(): Record<string, LedgerTotals>;
  accounts(): Record<string, Record<string, number>>;
  snapshot(): LedgerState;
  /** Replace state; returns `false` without mutation when the state is malformed. */
  restore(next: LedgerState): boolean;
  stats(): LedgerStats;
  reset(): void;
  /** Drop the devtools probe registered by `devtoolsName`. Safe to call twice. */
  dispose(): void;
}

const EPSILON = 1e-9;

function isMinorUnits(value: number): boolean {
  return Number.isSafeInteger(value);
}

function withinOverdraft(nextBalance: number, overdraft: boolean | { max: number } | undefined): boolean {
  if (nextBalance >= 0) return true;
  if (overdraft === undefined || overdraft === false) return false;
  if (overdraft === true) return true;
  return nextBalance >= -overdraft.max;
}

function validCharge(charge: RecurringCharge): boolean {
  return (
    charge.id.trim() !== "" &&
    charge.account.trim() !== "" &&
    charge.currency.trim() !== "" &&
    charge.reason.trim() !== "" &&
    isMinorUnits(charge.amountPerPeriod) && charge.amountPerPeriod > 0 &&
    Number.isFinite(charge.everySeconds) && charge.everySeconds > 0 &&
    (charge.startSeconds === undefined || (Number.isFinite(charge.startSeconds) && charge.startSeconds >= 0)) &&
    (charge.maxCatchUp === undefined || (Number.isInteger(charge.maxCatchUp) && charge.maxCatchUp > 0))
  );
}

/**
 * The books a business keeps: per-account, per-currency balances in integer minor units with a
 * journal that records every movement, the balance it produced and the reason it happened.
 * {@link TransactionLedger.post} is the one money path — sales, purchases, upkeep and loan
 * payments all go through it, so nothing moves without a reason on the record.
 * {@link TransactionLedger.chargeDue} settles recurring charges (upkeep, rent) on their own
 * cadence, bounded per advance; a cycle with no funds is counted as missed instead of overdrawing.
 * Journal memory is bounded by `maxEntries`, with `totals()` keeping the per-reason summary beyond it.
 *
 * @capability transaction-ledger record every money movement with its reason over per-account integer minor-unit balances
 */
export function createTransactionLedger(options: TransactionLedgerOptions = {}): TransactionLedger {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 1024));
  const maxCyclesPerAdvance = Math.max(1, Math.floor(options.maxCyclesPerAdvance ?? 256));

  let nowSeconds = 0;
  let accounts: Record<string, Record<string, number>> = {};
  let entries: LedgerEntry[] = [];
  let totals: Record<string, LedgerTotals> = {};
  let charges: Record<string, RecurringCharge> = {};
  let cursors: Record<string, ChargeCursor> = {};
  let seq = 0;

  const probe = options.devtoolsName === undefined
    ? null
    : devtools.probes.register(options.devtoolsName, () => ({ ...readStats(), totals: readTotals() }));

  function readStats(): LedgerStats {
    return { accounts: Object.keys(accounts).length, entries: entries.length, charges: Object.keys(charges).length, seq };
  }

  function readTotals(): Record<string, LedgerTotals> {
    const out: Record<string, LedgerTotals> = {};
    for (const [reason, entry] of Object.entries(totals)) out[reason] = { ...entry };
    return out;
  }

  function readAccounts(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const [account, wallet] of Object.entries(accounts)) out[account] = { ...wallet };
    return out;
  }

  function apply(at: number, account: string, currency: string, amount: number, reason: string, ref: string | undefined, overdraft: LedgerPostInput["overdraft"]): LedgerPostResult {
    const wallet = accounts[account];
    if (wallet === undefined) return { ok: false, reason: "unknown-account" };
    if (!isMinorUnits(amount) || amount === 0) return { ok: false, reason: "invalid-amount" };
    if (reason.trim() === "") return { ok: false, reason: "invalid-reason" };
    const next = (wallet[currency] ?? 0) + amount;
    if (!isMinorUnits(next) || !withinOverdraft(next, overdraft)) return { ok: false, reason: "insufficient-funds" };
    wallet[currency] = next;
    seq += 1;
    const entry: LedgerEntry = ref === undefined
      ? { seq, at, account, currency, amount, balanceAfter: next, reason }
      : { seq, at, account, currency, amount, balanceAfter: next, reason, ref };
    entries.push(entry);
    if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
    const total = totals[reason] ?? { count: 0, net: 0 };
    totals[reason] = { count: total.count + 1, net: total.net + amount };
    return { ok: true, entry: { ...entry } };
  }

  return {
    openAccount(account, currency, initial = 0) {
      if (account.trim() === "" || currency.trim() === "") return;
      if (!isMinorUnits(initial)) return;
      const wallet = accounts[account] ?? (accounts[account] = {});
      if (wallet[currency] === undefined) wallet[currency] = initial;
    },
    balanceOf(account, currency) {
      return accounts[account]?.[currency] ?? 0;
    },
    post(input) {
      return apply(input.at, input.account, input.currency, input.amount, input.reason, input.ref, input.overdraft);
    },
    addCharge(charge) {
      if (!validCharge(charge) || charges[charge.id] !== undefined) return false;
      charges[charge.id] = { ...charge };
      cursors[charge.id] = {
        nextDueSeconds: charge.startSeconds ?? nowSeconds,
        fired: 0,
        missed: 0,
        done: false,
      };
      return true;
    },
    removeCharge(id) {
      if (charges[id] === undefined) return false;
      const nextCharges = { ...charges };
      const nextCursors = { ...cursors };
      delete nextCharges[id];
      delete nextCursors[id];
      charges = nextCharges;
      cursors = nextCursors;
      return true;
    },
    chargeDue(toSeconds) {
      if (toSeconds < nowSeconds) {
        throw new RangeError(`chargeDue cannot rewind: ${toSeconds} < ${nowSeconds}`);
      }
      const charged: LedgerEntry[] = [];
      const missed: { id: string; cycles: number }[] = [];
      for (const id of Object.keys(charges).sort()) {
        const charge = charges[id]!;
        const cursor = { ...cursors[id]! };
        if (cursor.done || cursor.nextDueSeconds > toSeconds) {
          cursors[id] = cursor;
          continue;
        }
        const dueCount = Math.floor((toSeconds - cursor.nextDueSeconds) / charge.everySeconds + EPSILON) + 1;
        const policy = charge.catchUp ?? "each";
        const perChargeLimit = charge.maxCatchUp ?? Number.POSITIVE_INFINITY;
        const kept = policy === "skip" ? 1 : Math.min(dueCount, perChargeLimit, maxCyclesPerAdvance);
        const firstDue = cursor.nextDueSeconds;

        if (policy === "skip") {
          const at = firstDue + (dueCount - 1) * charge.everySeconds;
          const result = apply(at, charge.account, charge.currency, -charge.amountPerPeriod, charge.reason, charge.ref ?? id, undefined);
          if (result.ok) {
            charged.push(result.entry);
            cursor.fired += 1;
          } else {
            cursor.missed += 1;
            missed.push({ id, cycles: 1 });
          }
        } else if (policy === "sum") {
          const at = firstDue + (kept - 1) * charge.everySeconds;
          const result = apply(at, charge.account, charge.currency, -charge.amountPerPeriod * kept, charge.reason, charge.ref ?? id, undefined);
          if (result.ok) {
            charged.push(result.entry);
            cursor.fired += kept;
          } else {
            cursor.missed += kept;
            missed.push({ id, cycles: kept });
          }
        } else {
          let failed = 0;
          for (let i = 0; i < kept; i += 1) {
            const at = firstDue + i * charge.everySeconds;
            const result = apply(at, charge.account, charge.currency, -charge.amountPerPeriod, charge.reason, charge.ref ?? id, undefined);
            if (result.ok) {
              charged.push(result.entry);
              cursor.fired += 1;
            } else {
              failed += 1;
            }
          }
          cursor.missed += failed;
          if (failed > 0) missed.push({ id, cycles: failed });
        }

        cursor.nextDueSeconds = firstDue + dueCount * charge.everySeconds;
        cursors[id] = cursor;
      }
      nowSeconds = toSeconds;
      return { charged, missed };
    },
    entries(filter = {}) {
      const limit = filter.limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(filter.limit));
      const out: LedgerEntry[] = [];
      for (const entry of entries) {
        if (filter.account !== undefined && entry.account !== filter.account) continue;
        if (filter.reason !== undefined && entry.reason !== filter.reason) continue;
        if (filter.since !== undefined && entry.at < filter.since) continue;
        out.push({ ...entry });
      }
      return Number.isFinite(limit) && out.length > limit ? out.slice(out.length - limit) : out;
    },
    totals: readTotals,
    accounts: readAccounts,
    snapshot() {
      return {
        nowSeconds,
        accounts: readAccounts(),
        entries: entries.map((entry) => ({ ...entry })),
        totals: readTotals(),
        charges: Object.fromEntries(Object.entries(charges).map(([id, charge]) => [id, { ...charge }])),
        cursors: Object.fromEntries(Object.entries(cursors).map(([id, cursor]) => [id, { ...cursor }])),
        seq,
      };
    },
    restore(next) {
      if (!Number.isFinite(next.nowSeconds) || next.nowSeconds < 0) return false;
      if (!Number.isInteger(next.seq) || next.seq < 0) return false;
      if (next.accounts === undefined || next.entries === undefined || next.totals === undefined) return false;
      if (next.charges === undefined || next.cursors === undefined) return false;
      const nextAccounts: Record<string, Record<string, number>> = {};
      for (const [account, wallet] of Object.entries(next.accounts)) {
        const copy: Record<string, number> = {};
        for (const [currency, amount] of Object.entries(wallet)) {
          if (!isMinorUnits(amount)) return false;
          copy[currency] = amount;
        }
        nextAccounts[account] = copy;
      }
      const nextEntries: LedgerEntry[] = [];
      for (const entry of next.entries) {
        if (!Number.isInteger(entry.seq) || entry.seq < 1) return false;
        if (!Number.isFinite(entry.at) || entry.at < 0) return false;
        if (typeof entry.account !== "string" || entry.account.trim() === "") return false;
        if (typeof entry.currency !== "string" || entry.currency.trim() === "") return false;
        if (!isMinorUnits(entry.amount) || !isMinorUnits(entry.balanceAfter)) return false;
        if (typeof entry.reason !== "string" || entry.reason.trim() === "") return false;
        nextEntries.push({ ...entry });
      }
      const nextTotals: Record<string, LedgerTotals> = {};
      for (const [reason, total] of Object.entries(next.totals)) {
        if (!Number.isInteger(total.count) || total.count < 0 || !isMinorUnits(total.net)) return false;
        nextTotals[reason] = { count: total.count, net: total.net };
      }
      const nextCharges: Record<string, RecurringCharge> = {};
      const nextCursors: Record<string, ChargeCursor> = {};
      for (const [id, charge] of Object.entries(next.charges)) {
        if (!validCharge(charge) || charge.id !== id) return false;
        const cursor = next.cursors[id];
        if (cursor === undefined) return false;
        if (!Number.isFinite(cursor.nextDueSeconds) || cursor.nextDueSeconds < 0) return false;
        if (!Number.isInteger(cursor.fired) || cursor.fired < 0) return false;
        if (!Number.isInteger(cursor.missed) || cursor.missed < 0) return false;
        if (typeof cursor.done !== "boolean") return false;
        nextCharges[id] = { ...charge };
        nextCursors[id] = { ...cursor };
      }

      nowSeconds = next.nowSeconds;
      accounts = nextAccounts;
      entries = nextEntries.length > maxEntries ? nextEntries.slice(nextEntries.length - maxEntries) : nextEntries;
      totals = nextTotals;
      charges = nextCharges;
      cursors = nextCursors;
      seq = next.seq;
      return true;
    },
    stats: readStats,
    reset() {
      nowSeconds = 0;
      accounts = {};
      entries = [];
      totals = {};
      charges = {};
      cursors = {};
      seq = 0;
    },
    dispose() {
      probe?.();
    },
  };
}
