import { createLoanBook, type LoanBook, type LoanTerms } from "@jgengine/core/economy/loanBook";
import { createTransactionLedger, type TransactionLedger } from "@jgengine/core/economy/transactionLedger";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { WorldModel } from "@jgengine/core/worldModel/worldModel";

import { MONTH_DAYS } from "../books";
import { LOAN, park } from "../park";
import { session } from "../session";

/**
 * The park's bank loan, on the shared loan book: a revolving line the park opens owing `LOAN.start`
 * on, draws on in `LOAN.step`s up to `LOAN.max`, repays in steps, and is charged `LOAN.monthlyRate`
 * on what it owes as each month closes. The book's clock counts months closed, so period `n` falls
 * due at the close of the `n`th month. The park goes into the red rather than into arrears (two red
 * month-ends close it, not the bank), so the book overdraws instead of missing a payment.
 *
 * The till and the month's lines stay the world's: the cash of a draw or a repayment is the
 * `take_loan` / `repay_loan` action, and the interest is the `interest` ripple, scaled by what the
 * book charged. The book's balance and interest are published as `park.loan_owed` and
 * `park.interest_paid`, which is how a save keeps the loan: the book is rebuilt from them when a
 * session starts or a park is loaded.
 */

const LINE = "bank";
const ACCOUNT = "park";
const CURRENCY = "usd";

function lineTerms(): LoanTerms {
  return {
    id: LINE,
    principal: LOAN.start,
    ratePerPeriod: LOAN.monthlyRate,
    method: "revolving",
    limit: LOAN.max,
    periodSeconds: 1,
    startSeconds: 1,
    account: ACCOUNT,
    currency: CURRENCY,
  };
}

interface Bank {
  ctx: GameContext;
  /** The session generation the bank belongs to: `resetSession` makes a new guest map. */
  generation: object;
  ledger: TransactionLedger;
  book: LoanBook;
}

let bank: Bank | null = null;

/** Months the park has closed by the start of `day`. */
export function monthsClosed(day: number): number {
  return Math.floor((day - 1) / MONTH_DAYS);
}

/**
 * The live loan book, rebuilt from the world's published balance when a session starts. `closed` is
 * how many months have been charged at this moment, which the month's own close passes before it
 * charges.
 */
function bankOf(ctx: GameContext, closed: number): Bank {
  if (bank !== null && bank.ctx === ctx && bank.generation === session.guests) return bank;
  const w = park.of(ctx);
  const ledger = createTransactionLedger();
  ledger.openAccount(ACCOUNT, CURRENCY);
  const book = createLoanBook({ ledger, account: ACCOUNT, currency: CURRENCY, overdraft: true });
  const interestPaid = Math.round(w.num("park.interest_paid"));
  book.restore({
    loans: [{
      terms: lineTerms(),
      paid: closed,
      paidAmount: interestPaid,
      interestPaid,
      missed: 0,
      defaulted: false,
      settled: false,
      outstanding: Math.round(w.num("park.loan_owed")),
    }],
  });
  bank = { ctx, generation: session.guests, ledger, book };
  return bank;
}

function publish(w: WorldModel, book: LoanBook): void {
  w.set("park.loan_owed", book.outstanding(LINE));
}

/** The park's loan book, for a probe or a test. */
export function parkLoanBook(ctx: GameContext): LoanBook {
  return bankOf(ctx, monthsClosed(park.of(ctx).num("park.day"))).book;
}

/** `take_loan` landed: draw a step on the line. The world's action already paid it into the till. */
export function drawLoan(ctx: GameContext, w: WorldModel): void {
  const closed = monthsClosed(w.num("park.day"));
  const { book } = bankOf(ctx, closed);
  book.draw(LINE, LOAN.step, closed);
  publish(w, book);
}

/** `repay_loan` landed: a step of principal back to the bank. The world's action took it from the till. */
export function repayLoan(ctx: GameContext, w: WorldModel): void {
  const closed = monthsClosed(w.num("park.day"));
  const { book } = bankOf(ctx, closed);
  book.repay(LINE, LOAN.step, closed);
  publish(w, book);
}

/**
 * Close month `monthIndex` (0-based) at the bank: charge its period's interest on what the park owes
 * and post it to the till as the `interest` ripple. Returns the interest charged.
 */
export function chargeMonth(ctx: GameContext, monthIndex: number): number {
  const { book } = bankOf(ctx, monthIndex);
  let charged = 0;
  for (const payment of book.advance(monthIndex + 1).paid) {
    park.of(ctx).emit({ kind: "interest", scale: payment.interest });
    charged += payment.interest;
  }
  publish(park.of(ctx), book);
  return charged;
}
