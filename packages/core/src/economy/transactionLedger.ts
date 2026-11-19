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
  amount: number;
  /** The account's balance in this currency after the entry was applied. */
  balanceAfter: number;
  /** Caller-owned reason code — `"sale"`, `"upkeep"`, `"loan-interest"`. Never interpreted here. */
  reason: string;
  ref?: string;
}

export interface LedgerPostInput {
  at: number;
  account: string;
  currency: string;
  amount: number;
  reason: string;
  ref?: string;
  overdraft?: boolean | { max: number };
}

export type LedgerPostResult =
  | { ok: true; entry: LedgerEntry }
  | { ok: false; reason: "unknown-account" | "invalid-amount" | "invalid-reason" | "insufficient-funds" };

export interface RecurringCharge {
  id: string;
  account: string;
  currency: string;
  amountPerPeriod: number;
  /** Cadence in seconds; must be `> 0`. */
  everySeconds: number;
  /** First due time in seconds; defaults to the ledger clock when the charge is added. */
  startSeconds?: number;
  reason: string;
  ref?: string;
  catchUp?: "each" | "sum" | "skip";
  /** Due cycles beyond this in one advance are dropped rather than settled. */
  maxCatchUp?: number;
}

export interface ChargeCursor {
  nextDueSeconds: number;
  fired: number;
  missed: number;
  done: boolean;
}

export interface LedgerTotals {
  count: number;
  net: number;
}

export interface LedgerStats {
  accounts: number;
  entries: number;
  charges: number;
  seq: number;
}

export interface LedgerState {
  nowSeconds: number;
  accounts: Record<string, Record<string, number>>;
  entries: readonly LedgerEntry[];
  totals: Record<string, LedgerTotals>;
  charges: Record<string, RecurringCharge>;
  cursors: Record<string, ChargeCursor>;
  seq: number;
}

export interface LedgerAdvanceResult {
  charged: readonly LedgerEntry[];
  missed: readonly { id: string; cycles: number }[];
}

export interface LedgerEntryFilter {
  account?: string;
  reason?: string;
  since?: number;
  limit?: number;
}

export interface TransactionLedgerOptions {
  maxEntries?: number;
  /** Safety bound on cycles settled per charge per advance (default `256`). */
  maxCyclesPerAdvance?: number;
  devtoolsName?: string;
}

export interface TransactionLedger {
  openAccount(account: string, currency: string, initial?: number): void;
  balanceOf(account: string, currency: string): number;
  post(input: LedgerPostInput): LedgerPostResult;
  addCharge(charge: RecurringCharge): boolean;
  removeCharge(id: string): boolean;
  chargeDue(nowSeconds: number): LedgerAdvanceResult;
  entries(filter?: LedgerEntryFilter): LedgerEntry[];
  totals(): Record<string, LedgerTotals>;
  accounts(): Record<string, Record<string, number>>;
  snapshot(): LedgerState;
  restore(next: LedgerState): boolean;
  stats(): LedgerStats;
  reset(): void;
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
