import { describe, expect, test } from "bun:test";

import { devtools } from "../devtools/devtools";
import { createTransactionLedger } from "./transactionLedger";
import { buildLoanSchedule, createLoanBook, type LoanTerms } from "./loanBook";

function terms(overrides: Partial<LoanTerms> = {}): LoanTerms {
  return { id: "bond", principal: 10_000, ratePerPeriod: 0.02, periods: 5, periodSeconds: 60, startSeconds: 60, ...overrides };
}

function book(startingCash = 0, maxMissed = 3) {
  const ledger = createTransactionLedger();
  ledger.openAccount("biz", "cents", startingCash);
  return { ledger, loans: createLoanBook({ ledger, currency: "cents", account: "biz", maxMissed }) };
}

describe("repayment schedule", () => {
  test("an amortized loan levels the payment and the principal parts sum exactly", () => {
    const schedule = buildLoanSchedule(terms());
    expect(schedule.payments.map((payment) => payment.amount)).toEqual([2_122, 2_122, 2_122, 2_122, 2_120]);
    expect(schedule.payments.map((payment) => payment.interest)).toEqual([200, 162, 122, 82, 42]);
    expect(schedule.payments.map((payment) => payment.principal)).toEqual([1_922, 1_960, 2_000, 2_040, 2_078]);
    expect(schedule.payments.map((payment) => payment.balanceAfter)).toEqual([8_078, 6_118, 4_118, 2_078, 0]);
    expect(schedule.payments.map((payment) => payment.dueSeconds)).toEqual([60, 120, 180, 240, 300]);
    expect(schedule.totalInterest).toBe(608);
    expect(schedule.totalPaid).toBe(10_608);
  });

  test("a flat loan charges interest on the original principal", () => {
    const schedule = buildLoanSchedule(terms({ method: "flat" }));
    expect(schedule.payments.map((payment) => payment.interest)).toEqual([200, 200, 200, 200, 200]);
    expect(schedule.payments.map((payment) => payment.principal)).toEqual([2_000, 2_000, 2_000, 2_000, 2_000]);
    expect(schedule.totalInterest).toBe(1_000);
    expect(schedule.totalPaid).toBe(11_000);
  });

  test("a zero-rate loan and an odd principal both end at zero balance", () => {
    const free = buildLoanSchedule(terms({ principal: 900, ratePerPeriod: 0, periods: 3 }));
    expect(free.payments.map((payment) => payment.amount)).toEqual([300, 300, 300]);
    expect(free.totalInterest).toBe(0);

    const odd = buildLoanSchedule(terms({ principal: 1_000, ratePerPeriod: 0.07, periods: 3 }));
    expect(odd.payments.reduce((sum, payment) => sum + payment.principal, 0)).toBe(1_000);
    expect(odd.payments[odd.payments.length - 1]!.balanceAfter).toBe(0);
  });

  test("a one-period loan repays principal plus one period of interest", () => {
    const schedule = buildLoanSchedule(terms({ periods: 1, ratePerPeriod: 0.05 }));
    expect(schedule.payments).toEqual([
      { index: 1, dueSeconds: 60, interest: 500, principal: 10_000, amount: 10_500, balanceAfter: 0 },
    ]);
  });

  test("terms it cannot schedule are refused by name", () => {
    expect(() => buildLoanSchedule(terms({ principal: 0 }))).toThrow("positive integer");
    expect(() => buildLoanSchedule(terms({ periods: 0 }))).toThrow("integer >= 1");
    expect(() => buildLoanSchedule(terms({ periodSeconds: 0 }))).toThrow("must be positive");
    expect(() => buildLoanSchedule(terms({ ratePerPeriod: -1 }))).toThrow("non-negative");
    expect(() => buildLoanSchedule(terms({ method: "balloon" as "flat" }))).toThrow('"amortized" or "flat"');
  });
});

describe("drawing and servicing a loan", () => {
  test("a draw posts the principal and a scheduled payment posts its interest and principal apart", () => {
    const { ledger, loans } = book(2_000);
    const loan = loans.originate(terms())!;
    expect(loan).toMatchObject({ outstanding: 10_000, paid: 0, defaulted: false, settled: false });
    expect(ledger.balanceOf("biz", "cents")).toBe(12_000);
    expect(ledger.entries()).toMatchObject([{ reason: "loan-draw", amount: 10_000, ref: "bond" }]);
    expect(loans.nextPayment("bond")).toMatchObject({ index: 1, dueSeconds: 60, amount: 2_122 });

    expect(loans.advance(0)).toEqual({ paid: [], missed: [], defaulted: [] });
    const first = loans.advance(60);
    expect(first.paid).toEqual([loan.schedule.payments[0]]);
    expect(ledger.entries({ reason: "loan-interest" })).toMatchObject([{ at: 60, amount: -200, ref: "bond", balanceAfter: 11_800 }]);
    expect(ledger.entries({ reason: "loan-principal" })).toMatchObject([{ at: 60, amount: -1_922, ref: "bond", balanceAfter: 9_878 }]);
    expect(loans.outstanding("bond")).toBe(8_078);
    expect(ledger.balanceOf("biz", "cents")).toBe(9_878);
  });

  test("advancing past the last payment settles the loan at exactly the scheduled total", () => {
    const { ledger, loans } = book(2_000);
    loans.originate(terms());
    const result = loans.advance(300);
    expect(result.paid).toHaveLength(5);
    expect(result.defaulted).toEqual([]);
    expect(loans.loan("bond")).toMatchObject({ settled: true, outstanding: 0, paid: 5, paidAmount: 10_608, interestPaid: 608 });
    expect(ledger.balanceOf("biz", "cents")).toBe(1_392);
    expect(ledger.totals()).toEqual({
      "loan-draw": { count: 1, net: 10_000 },
      "loan-interest": { count: 5, net: -608 },
      "loan-principal": { count: 5, net: -10_000 },
    });
    expect(loans.nextPayment("bond")).toBeNull();
    expect(loans.advance(1_000).paid).toEqual([]);
  });

  test("a payment with no funds falls into arrears and the loan defaults at the miss limit", () => {
    const { ledger, loans } = book();
    loans.originate(terms({ principal: 1_000, ratePerPeriod: 0.05, periods: 2 }));
    expect(ledger.post({ at: 1, account: "biz", currency: "cents", amount: -1_000, reason: "purchase" })).toMatchObject({ ok: true });

    expect(loans.advance(60)).toEqual({ paid: [], missed: [{ id: "bond", index: 1, amount: 538 }], defaulted: [] });
    expect(loans.advance(120)).toMatchObject({ missed: [{ id: "bond", index: 1, amount: 538 }] });
    expect(loans.advance(180)).toEqual({ paid: [], missed: [{ id: "bond", index: 1, amount: 538 }], defaulted: ["bond"] });
    expect(loans.loan("bond")).toMatchObject({ defaulted: true, missed: 3, paid: 0, outstanding: 1_000 });
    expect(ledger.balanceOf("biz", "cents")).toBe(0);
    expect(ledger.entries({ reason: "loan-interest" })).toHaveLength(0);
    expect(loans.advance(600).missed).toEqual([]);
  });

  test("repaying early cuts the outstanding principal and the remaining payments with it", () => {
    const { ledger, loans } = book(2_000);
    loans.originate(terms());
    expect(loans.repay("bond", 4_000, 30)).toEqual({ ok: true, applied: 4_000, outstanding: 6_000, settled: false });
    expect(ledger.entries()).toMatchObject([{ reason: "loan-draw" }, { reason: "loan-repayment", amount: -4_000, ref: "bond" }]);

    loans.advance(60);
    expect(loans.outstanding("bond")).toBe(4_078);
    expect(loans.repay("bond", 10_000, 90)).toEqual({ ok: true, applied: 4_078, outstanding: 0, settled: true });
    expect(loans.loan("bond")).toMatchObject({ settled: true, paid: 1 });
    expect(loans.advance(600).paid).toEqual([]);
  });

  test("an early repayment with no funds is refused without moving the loan", () => {
    const { ledger, loans } = book();
    loans.originate(terms({ principal: 500 }));
    ledger.post({ at: 1, account: "biz", currency: "cents", amount: -500, reason: "purchase" });
    expect(loans.repay("bond", 100, 2)).toEqual({ ok: false, applied: 0, outstanding: 500, settled: false });
    expect(loans.repay("ghost", 100, 2)).toBeNull();
    expect(loans.repay("bond", 0, 2)).toBeNull();
  });

  test("unusable terms and unknown accounts draw nothing", () => {
    const { ledger, loans } = book();
    expect(loans.originate(terms({ principal: -1 }))).toBeNull();
    expect(loans.originate(terms())).toMatchObject({ id: "bond" });
    expect(loans.originate(terms())).toBeNull();
    expect(loans.originate(terms({ id: "other", account: "ghost" }))).toBeNull();
    expect(ledger.entries({ reason: "loan-draw" })).toHaveLength(1);
  });
});

describe("state and probe", () => {
  test("snapshot and restore round-trip a half-paid and a defaulted loan through JSON", () => {
    const { loans } = book();
    loans.originate(terms());
    loans.originate(terms({ id: "small", principal: 300, ratePerPeriod: 0, periods: 2 }));
    loans.advance(60);

    const snapshot = JSON.parse(JSON.stringify(loans.snapshot()));
    const restored = createLoanBook({ ledger: book().ledger, currency: "cents", account: "biz" });
    expect(restored.restore(snapshot)).toBe(true);
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.scheduleOf("bond")).toEqual(loans.scheduleOf("bond"));
    expect(restored.outstanding("bond")).toBe(loans.outstanding("bond"));
    expect(restored.nextPayment("small")).toMatchObject({ index: 2 });
  });

  test("restore refuses malformed state without mutating", () => {
    const { loans } = book();
    loans.originate(terms());
    const before = loans.snapshot();
    expect(loans.restore({ loans: [{ ...before.loans[0]!, paid: -1 }] })).toBe(false);
    expect(loans.restore({ loans: [{ ...before.loans[0]!, paid: 99 }] })).toBe(false);
    expect(loans.restore({ loans: [{ ...before.loans[0]!, outstanding: 999_999 }] })).toBe(false);
    expect(loans.restore({ loans: [{ ...before.loans[0]!, terms: { ...terms(), principal: 0 } }] })).toBe(false);
    expect(loans.restore({ loans: [before.loans[0]!, before.loans[0]!] })).toBe(false);
    expect(loans.snapshot()).toEqual(before);
  });

  test("stats and the probe report the book; reset clears it", () => {
    const ledger = createTransactionLedger();
    ledger.openAccount("biz", "cents", 0);
    const loans = createLoanBook({ ledger, currency: "cents", account: "biz", devtoolsName: "loans.test" });
    loans.originate(terms());
    loans.originate(terms({ id: "settled", principal: 100, ratePerPeriod: 0, periods: 1 }));
    loans.advance(60);
    expect(loans.stats()).toEqual({
      loans: 2,
      active: 1,
      defaulted: 0,
      settled: 1,
      outstanding: 8_078,
      paidAmount: 2_122 + 100,
      interestPaid: 200,
      missed: 0,
    });
    expect(devtools.probes.read()["loans.test"]).toEqual(loans.stats());
    loans.reset();
    expect(loans.stats()).toMatchObject({ loans: 0, outstanding: 0 });
    loans.dispose();
    expect(devtools.probes.read()["loans.test"]).toBeUndefined();
  });
});
