import { devtools } from "../devtools/devtools";
import type { TransactionLedger } from "./transactionLedger";

/**
 * Money in this module is an integer count of **minor units** — cents when the currency has two
 * decimals, whole coins when it has none. Principal, interest, payments and balances are safe
 * integers, so a schedule adds up exactly.
 */

export interface LoanTerms {
  id: string;
  /** Integer minor units borrowed; must be `> 0`. */
  principal: number;
  ratePerPeriod: number;
  /**
   * Number of scheduled payments; integer `>= 1`. Required for `"amortized"` and `"flat"`; a
   * `"revolving"` line has no term and ignores it.
   */
  periods?: number;
  /** Seconds between scheduled payments; must be `> 0`. */
  periodSeconds: number;
  /** When the first payment is due, in seconds. */
  startSeconds: number;
  method?: LoanMethod;
  /** Most a `"revolving"` line may have outstanding, in minor units; `>= principal`. Ignored otherwise. */
  limit?: number;
  currency?: string;
  account?: string;
}

export type LoanMethod = "amortized" | "flat" | "revolving";

export interface LoanPayment {
  /** 1-based. */
  index: number;
  dueSeconds: number;
  interest: number;
  principal: number;
  amount: number;
  balanceAfter: number;
}

export interface LoanSchedule {
  id: string;
  principal: number;
  method: LoanMethod;
  payments: readonly LoanPayment[];
  totalInterest: number;
  totalPaid: number;
}

export interface LoanRecord {
  id: string;
  /** The terms it was drawn on, kept whole so a save stores them verbatim. */
  terms: LoanTerms;
  principal: number;
  ratePerPeriod: number;
  periods: number;
  limit: number | null;
  currency: string;
  account: string;
  schedule: LoanSchedule;
  paid: number;
  paidAmount: number;
  interestPaid: number;
  missed: number;
  defaulted: boolean;
  /** True once the principal is fully repaid, early or on schedule. A revolving line never settles. */
  settled: boolean;
  outstanding: number;
}

export interface LoanState {
  terms: LoanTerms;
  paid: number;
  paidAmount: number;
  interestPaid: number;
  missed: number;
  defaulted: boolean;
  settled: boolean;
  outstanding: number;
}

export interface LoanBookState {
  loans: readonly LoanState[];
}

export interface LoanAdvanceResult {
  paid: readonly LoanPayment[];
  missed: readonly { id: string; index: number; amount: number }[];
  defaulted: readonly string[];
}

export interface LoanBookStats {
  loans: number;
  active: number;
  defaulted: number;
  settled: number;
  outstanding: number;
  paidAmount: number;
  interestPaid: number;
  missed: number;
}

export interface LoanRepayment {
  ok: boolean;
  applied: number;
  outstanding: number;
  settled: boolean;
}

export interface LoanDraw {
  ok: boolean;
  applied: number;
  outstanding: number;
}

export interface LoanBookOptions {
  ledger: TransactionLedger;
  /** Default currency for loans that do not name one. */
  currency?: string;
  /** Default owing account for loans that do not name one. */
  account?: string;
  maxMissed?: number;
  /**
   * Post due payments and early repayments even when the account cannot cover them: the borrower
   * goes into the red instead of into arrears, so no payment is missed and no loan defaults.
   * Default `false`.
   */
  overdraft?: boolean;
  devtoolsName?: string;
}

export interface LoanBook {
  originate(terms: LoanTerms): LoanRecord | null;
  advance(nowSeconds: number): LoanAdvanceResult;
  repay(loanId: string, amount: number, atSeconds: number): LoanRepayment | null;
  draw(loanId: string, amount: number, atSeconds: number): LoanDraw | null;
  outstanding(loanId: string): number;
  nextPayment(loanId: string): LoanPayment | null;
  scheduleOf(loanId: string): LoanSchedule | null;
  loan(loanId: string): LoanRecord | null;
  loans(): readonly LoanRecord[];
  snapshot(): LoanBookState;
  restore(next: LoanBookState): boolean;
  stats(): LoanBookStats;
  reset(): void;
  dispose(): void;
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

function assertTerms(terms: LoanTerms): void {
  check(terms.id.trim() !== "", 'Loan field "id" must not be empty');
  check(Number.isSafeInteger(terms.principal) && terms.principal > 0, `Loan "${terms.id}" principal must be a positive integer in minor units`);
  check(Number.isFinite(terms.ratePerPeriod) && terms.ratePerPeriod >= 0, `Loan "${terms.id}" ratePerPeriod must be a non-negative finite number`);
  check(Number.isFinite(terms.periodSeconds) && terms.periodSeconds > 0, `Loan "${terms.id}" periodSeconds must be positive`);
  check(Number.isFinite(terms.startSeconds) && terms.startSeconds >= 0, `Loan "${terms.id}" startSeconds must be a non-negative finite number`);
  const method = terms.method ?? "amortized";
  check(method === "amortized" || method === "flat" || method === "revolving", `Loan "${terms.id}" method must be "amortized", "flat" or "revolving"`);
  if (method === "revolving") {
    const limit = terms.limit;
    check(limit !== undefined && Number.isSafeInteger(limit) && limit >= terms.principal, `Loan "${terms.id}" limit must be an integer in minor units >= principal`);
  } else {
    check(terms.periods !== undefined && Number.isInteger(terms.periods) && terms.periods >= 1, `Loan "${terms.id}" periods must be an integer >= 1`);
  }
}

/**
 * Build a loan's repayment schedule: one entry per period with its due time, interest/principal
 * split and the balance left, in integer minor units. An amortized loan levels the payment over
 * the outstanding balance (`P·i / (1 − (1+i)^−n)`); a flat loan charges interest on the original
 * principal. Either way the final payment absorbs the rounding, so the principal parts sum to the
 * principal exactly and the balance ends at zero. Deterministic and pure.
 *
 * @capability loan-schedule build a loan's interest and principal repayment schedule in integer minor units
 */
export function buildLoanSchedule(terms: LoanTerms): LoanSchedule {
  assertTerms(terms);
  const method = terms.method ?? "amortized";
  if (method === "revolving") return { id: terms.id, principal: terms.principal, method, payments: [], totalInterest: 0, totalPaid: 0 };
  const periods = terms.periods!;
  const rate = terms.ratePerPeriod;
  const level = method === "amortized"
    ? rate === 0
      ? terms.principal / periods
      : (terms.principal * rate) / (1 - (1 + rate) ** -periods)
    : terms.principal / periods + terms.principal * rate;
  const payment = Math.max(1, Math.round(level));

  const payments: LoanPayment[] = [];
  let balance = terms.principal;
  let totalInterest = 0;
  let totalPaid = 0;
  for (let index = 1; index <= periods; index += 1) {
    const interest = method === "flat" ? Math.round(terms.principal * rate) : Math.round(balance * rate);
    let principalPart = method === "flat" ? Math.floor(terms.principal / periods) : payment - interest;
    if (principalPart <= 0) principalPart = 1;
    if (index === periods || principalPart > balance) principalPart = balance;
    balance -= principalPart;
    const amount = interest + principalPart;
    totalInterest += interest;
    totalPaid += amount;
    payments.push({
      index,
      dueSeconds: terms.startSeconds + (index - 1) * terms.periodSeconds,
      interest,
      principal: principalPart,
      amount,
      balanceAfter: balance,
    });
  }

  return { id: terms.id, principal: terms.principal, method, payments, totalInterest, totalPaid };
}

/**
 * The loans a business owes, over a {@link TransactionLedger}: each draw posts the principal to the
 * borrower's account, each settled payment posts its interest (`"loan-interest"`) and principal
 * (`"loan-principal"`) as separate reason-tagged entries, and an early repayment posts
 * `"loan-repayment"`. A payment that comes due with no funds is left in arrears and counted once
 * per advance; after `maxMissed` the loan is defaulted and stops being advanced — unless the book
 * `overdraft`s, when the borrower goes into the red instead. A `"revolving"` line is an open credit
 * line: `draw` adds to it up to its `limit` (`"loan-draw"`), each period charges interest on the
 * balance then outstanding, and repaying it to zero leaves it open. State is plain data —
 * `snapshot()` stores terms and progress, and the schedule is rebuilt from the terms.
 *
 * @capability loans draw, schedule, service and default a loan with interest, posted to a ledger
 */
export function createLoanBook(options: LoanBookOptions): LoanBook {
  const ledger = options.ledger;
  const defaultCurrency = options.currency ?? "credits";
  const defaultAccount = options.account ?? "business";
  const maxMissed = Math.max(1, Math.floor(options.maxMissed ?? 3));
  const overdraft = options.overdraft === true;
  const overdraw = overdraft ? { overdraft: true } : {};

  const records = new Map<string, LoanRecord>();

  const probe = options.devtoolsName === undefined
    ? null
    : devtools.probes.register(options.devtoolsName, () => readStats());

  function readStats(): LoanBookStats {
    let active = 0;
    let defaulted = 0;
    let settled = 0;
    let outstanding = 0;
    let paidAmount = 0;
    let interestPaid = 0;
    let missed = 0;
    for (const loan of records.values()) {
      if (loan.defaulted) defaulted += 1;
      else if (loan.settled) settled += 1;
      else active += 1;
      outstanding += loan.outstanding;
      paidAmount += loan.paidAmount;
      interestPaid += loan.interestPaid;
      missed += loan.missed;
    }
    return { loans: records.size, active, defaulted, settled, outstanding, paidAmount, interestPaid, missed };
  }

  function pending(loan: LoanRecord): LoanPayment | undefined {
    if (loan.limit === null) return loan.schedule.payments[loan.paid];
    const interest = Math.round(loan.outstanding * loan.ratePerPeriod);
    return {
      index: loan.paid + 1,
      dueSeconds: loan.terms.startSeconds + loan.paid * loan.terms.periodSeconds,
      interest,
      principal: 0,
      amount: interest,
      balanceAfter: loan.outstanding,
    };
  }

  function settle(loan: LoanRecord, payment: LoanPayment, at: number): boolean {
    const principalPart = Math.min(payment.principal, loan.outstanding);
    const total = payment.interest + principalPart;
    if (total <= 0) {
      // A period with nothing owed (a revolving line at zero) passes without a posting.
      loan.paid += 1;
      return true;
    }
    if (!overdraft && ledger.balanceOf(loan.account, loan.currency) < total) return false;
    if (payment.interest > 0) {
      ledger.post({ at, account: loan.account, currency: loan.currency, amount: -payment.interest, reason: "loan-interest", ref: loan.id, ...overdraw });
    }
    if (principalPart > 0) {
      ledger.post({ at, account: loan.account, currency: loan.currency, amount: -principalPart, reason: "loan-principal", ref: loan.id, ...overdraw });
    }
    loan.outstanding -= principalPart;
    loan.paidAmount += total;
    loan.interestPaid += payment.interest;
    loan.paid += 1;
    if (loan.outstanding <= 0) {
      loan.outstanding = 0;
      loan.settled = loan.limit === null;
    }
    return true;
  }

  return {
    originate(terms) {
      try {
        assertTerms(terms);
      } catch {
        return null;
      }
      if (records.has(terms.id)) return null;
      const currency = terms.currency ?? defaultCurrency;
      const account = terms.account ?? defaultAccount;
      const draw = ledger.post({ at: terms.startSeconds, account, currency, amount: terms.principal, reason: "loan-draw", ref: terms.id });
      if (!draw.ok) return null;
      const schedule = buildLoanSchedule(terms);
      const loan: LoanRecord = {
        id: terms.id,
        terms: { ...terms, currency, account },
        principal: terms.principal,
        ratePerPeriod: terms.ratePerPeriod,
        periods: schedule.payments.length,
        limit: schedule.method === "revolving" ? terms.limit! : null,
        currency,
        account,
        schedule,
        paid: 0,
        paidAmount: 0,
        interestPaid: 0,
        missed: 0,
        defaulted: false,
        settled: false,
        outstanding: terms.principal,
      };
      records.set(loan.id, loan);
      return { ...loan };
    },
    advance(nowSeconds) {
      const paid: LoanPayment[] = [];
      const missed: { id: string; index: number; amount: number }[] = [];
      const defaulted: string[] = [];
      for (const id of [...records.keys()].sort()) {
        const loan = records.get(id)!;
        if (loan.settled || loan.defaulted) continue;
        for (;;) {
          const payment = pending(loan);
          if (payment === undefined || payment.dueSeconds > nowSeconds) break;
          if (settle(loan, payment, payment.dueSeconds)) {
            if (payment.amount > 0) paid.push(payment);
            if (loan.settled) break;
            continue;
          }
          loan.missed += 1;
          missed.push({ id: loan.id, index: payment.index, amount: payment.amount });
          if (loan.missed >= maxMissed) {
            loan.defaulted = true;
            defaulted.push(loan.id);
          }
          break;
        }
      }
      return { paid, missed, defaulted };
    },
    repay(loanId, amount, atSeconds) {
      const loan = records.get(loanId);
      if (loan === undefined || loan.settled || loan.defaulted) return null;
      if (!Number.isSafeInteger(amount) || amount <= 0) return null;
      const applied = Math.min(amount, loan.outstanding);
      if (applied <= 0) return { ok: false, applied: 0, outstanding: loan.outstanding, settled: loan.settled };
      const result = ledger.post({ at: atSeconds, account: loan.account, currency: loan.currency, amount: -applied, reason: "loan-repayment", ref: loan.id, ...overdraw });
      if (!result.ok) return { ok: false, applied: 0, outstanding: loan.outstanding, settled: loan.settled };
      loan.outstanding -= applied;
      loan.paidAmount += applied;
      if (loan.outstanding <= 0) {
        loan.outstanding = 0;
        loan.settled = loan.limit === null;
      }
      return { ok: true, applied, outstanding: loan.outstanding, settled: loan.settled };
    },
    draw(loanId, amount, atSeconds) {
      const loan = records.get(loanId);
      if (loan === undefined || loan.limit === null || loan.defaulted) return null;
      if (!Number.isSafeInteger(amount) || amount <= 0) return null;
      if (loan.outstanding + amount > loan.limit) return { ok: false, applied: 0, outstanding: loan.outstanding };
      const result = ledger.post({ at: atSeconds, account: loan.account, currency: loan.currency, amount, reason: "loan-draw", ref: loan.id });
      if (!result.ok) return { ok: false, applied: 0, outstanding: loan.outstanding };
      loan.outstanding += amount;
      return { ok: true, applied: amount, outstanding: loan.outstanding };
    },
    outstanding(loanId) {
      return records.get(loanId)?.outstanding ?? 0;
    },
    nextPayment(loanId) {
      const loan = records.get(loanId);
      if (loan === undefined || loan.settled) return null;
      return pending(loan) ?? null;
    },
    scheduleOf(loanId) {
      return records.get(loanId)?.schedule ?? null;
    },
    loan(loanId) {
      const loan = records.get(loanId);
      return loan === undefined ? null : { ...loan };
    },
    loans() {
      return Array.from(records.values(), (loan) => ({ ...loan }));
    },
    snapshot() {
      return {
        loans: Array.from(records.values(), (loan) => ({
          terms: { ...loan.terms },
          paid: loan.paid,
          paidAmount: loan.paidAmount,
          interestPaid: loan.interestPaid,
          missed: loan.missed,
          defaulted: loan.defaulted,
          settled: loan.settled,
          outstanding: loan.outstanding,
        })),
      };
    },
    restore(next) {
      if (!Array.isArray(next.loans)) return false;
      const restored = new Map<string, LoanRecord>();
      for (const state of next.loans) {
        if (!Number.isInteger(state.paid) || state.paid < 0) return false;
        if (!Number.isInteger(state.paidAmount) || state.paidAmount < 0) return false;
        if (!Number.isInteger(state.interestPaid) || state.interestPaid < 0) return false;
        if (!Number.isInteger(state.missed) || state.missed < 0) return false;
        if (typeof state.defaulted !== "boolean" || typeof state.settled !== "boolean") return false;
        if (!Number.isSafeInteger(state.outstanding) || state.outstanding < 0) return false;
        let schedule: LoanSchedule;
        try {
          schedule = buildLoanSchedule(state.terms);
        } catch {
          return false;
        }
        const limit = schedule.method === "revolving" ? state.terms.limit! : null;
        if (limit === null && state.paid > schedule.payments.length) return false;
        if (state.outstanding > (limit ?? state.terms.principal)) return false;
        if (restored.has(state.terms.id)) return false;
        restored.set(state.terms.id, {
          id: state.terms.id,
          terms: { ...state.terms },
          principal: state.terms.principal,
          ratePerPeriod: state.terms.ratePerPeriod,
          periods: schedule.payments.length,
          limit,
          currency: state.terms.currency ?? defaultCurrency,
          account: state.terms.account ?? defaultAccount,
          schedule,
          paid: state.paid,
          paidAmount: state.paidAmount,
          interestPaid: state.interestPaid,
          missed: state.missed,
          defaulted: state.defaulted,
          settled: state.settled,
          outstanding: state.outstanding,
        });
      }
      records.clear();
      for (const [id, loan] of restored) records.set(id, loan);
      return true;
    },
    stats: readStats,
    reset() {
      records.clear();
    },
    dispose() {
      probe?.();
    },
  };
}
