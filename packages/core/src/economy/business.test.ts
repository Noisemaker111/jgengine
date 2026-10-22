import { describe, expect, test } from "bun:test";

import { seededRng } from "../random/rng";
import { createMarket } from "./market";
import { createTransactionLedger, type TransactionLedger } from "./transactionLedger";
import { createLoanBook } from "./loanBook";

/**
 * The acceptance scenario for the economy primitives, composed here rather than shipped: an
 * unattended business that orders stock from a supplier, sells into a market whose price comes from
 * supply and demand, pays upkeep on a cadence and services a loan. Nothing below is a genre kit — it
 * is `createMarket` + `createTransactionLedger` + `createLoanBook` wired the way a game would.
 */

const CURRENCY = "cents";
const ACCOUNT = "business";
const GOOD = "grain";
const BASE_PRICE = 100;
const WHOLESALE = 60;
const PERIOD_SECONDS = 60;
const SEED = "b5.2-economy";

interface BusinessSettings {
  name: string;
  periods: number;
  startingCash: number;
  /** Units ordered from the supplier each period, whatever demand does. */
  orderPerPeriod: number;
  upkeepPerPeriod: number;
  /** Units buyers want per period at the base price. */
  demandPerPeriod: number;
  loan: { principal: number; ratePerPeriod: number; periods: number } | null;
}

interface BusinessRun {
  name: string;
  periods: number;
  startingCash: number;
  endingCash: number;
  /** `endingCash - startingCash`, in minor units. */
  net: number;
  /** A missed obligation — upkeep or a loan payment — at any point. */
  bankrupt: boolean;
  missedUpkeepCycles: number;
  missedLoanPayments: number;
  loanDefaulted: boolean;
  loanSettled: boolean;
  loanOutstanding: number;
  unitsSold: number;
  unitsWanted: number;
  unitsUnsold: number;
  revenue: number;
  purchaseSpend: number;
  upkeepPaid: number;
  interestPaid: number;
  /** Lowest period-end cash, in minor units. */
  cashFloor: number;
  firstPrice: number;
  lastPrice: number;
  endingStock: number;
  ledger: ReturnType<TransactionLedger["totals"]>;
}

function runBusiness(settings: BusinessSettings): BusinessRun {
  const ledger = createTransactionLedger();
  ledger.openAccount(ACCOUNT, CURRENCY, settings.startingCash);
  ledger.addCharge({
    id: "upkeep",
    account: ACCOUNT,
    currency: CURRENCY,
    amountPerPeriod: settings.upkeepPerPeriod,
    everySeconds: PERIOD_SECONDS,
    startSeconds: PERIOD_SECONDS,
    reason: "upkeep",
  });
  const loans = createLoanBook({ ledger, currency: CURRENCY, account: ACCOUNT, maxMissed: 3 });
  const market = createMarket({
    goods: [{
      id: GOOD,
      basePrice: BASE_PRICE,
      // The market starts holding the stock it wants, so the first price is the base price.
      stock: 4 * settings.demandPerPeriod,
      demand: settings.demandPerPeriod,
      coverPeriods: 4,
      restockCost: WHOLESALE,
    }],
  });
  const rng = seededRng(SEED);
  const loan = settings.loan === null
    ? null
    : loans.originate({
      id: "expansion",
      principal: settings.loan.principal,
      ratePerPeriod: settings.loan.ratePerPeriod,
      periods: settings.loan.periods,
      periodSeconds: PERIOD_SECONDS,
      startSeconds: PERIOD_SECONDS,
    });

  let missedUpkeepCycles = 0;
  let missedLoanPayments = 0;
  let loanDefaulted = false;
  let unitsSold = 0;
  let unitsWanted = 0;
  let revenue = 0;
  let purchaseSpend = 0;
  let upkeepPaid = 0;
  let cashFloor = settings.startingCash;
  const firstPrice = market.priceOf(GOOD);

  for (let period = 1; period <= settings.periods; period += 1) {
    const at = period * PERIOD_SECONDS;
    const upkeep = ledger.chargeDue(at);
    missedUpkeepCycles += upkeep.missed.reduce((sum, entry) => sum + entry.cycles, 0);
    upkeepPaid += upkeep.charged.reduce((sum, entry) => sum + -entry.amount, 0);
    if (loan !== null) {
      const advance = loans.advance(at);
      missedLoanPayments += advance.missed.length;
      if (advance.defaulted.length > 0) loanDefaulted = true;
    }

    const cost = market.restockCostOf(GOOD);
    const cash = ledger.balanceOf(ACCOUNT, CURRENCY);
    const ordered = Math.max(0, Math.min(settings.orderPerPeriod, Math.floor(cash / cost)));
    if (ordered > 0) {
      const purchase = ledger.post({ at, account: ACCOUNT, currency: CURRENCY, amount: -cost * ordered, reason: "purchase", ref: GOOD });
      if (purchase.ok) {
        market.restock(GOOD, ordered);
        purchaseSpend += cost * ordered;
      }
    }

    const wanted = Math.round(settings.demandPerPeriod * (0.8 + 0.4 * rng()));
    const served = Math.min(wanted, market.stockOf(GOOD));
    unitsWanted += wanted;
    if (served > 0) {
      const sale = market.sell(GOOD, served);
      if (sale.ok) {
        ledger.post({ at, account: ACCOUNT, currency: CURRENCY, amount: sale.total, reason: "sale", ref: GOOD });
        unitsSold += served;
        revenue += sale.total;
      }
    }
    market.recordDemand(GOOD, served, wanted - served);
    cashFloor = Math.min(cashFloor, ledger.balanceOf(ACCOUNT, CURRENCY));
  }

  const settledLoan = loans.loan("expansion");
  const endingCash = ledger.balanceOf(ACCOUNT, CURRENCY);
  return {
    name: settings.name,
    periods: settings.periods,
    startingCash: settings.startingCash,
    endingCash,
    net: endingCash - settings.startingCash,
    bankrupt: missedUpkeepCycles > 0 || missedLoanPayments > 0 || loanDefaulted,
    missedUpkeepCycles,
    missedLoanPayments,
    loanDefaulted,
    loanSettled: settledLoan?.settled ?? false,
    loanOutstanding: settledLoan?.outstanding ?? 0,
    unitsSold,
    unitsWanted,
    unitsUnsold: unitsWanted - unitsSold,
    revenue,
    purchaseSpend,
    upkeepPaid,
    interestPaid: settledLoan?.interestPaid ?? 0,
    cashFloor,
    firstPrice,
    lastPrice: market.priceOf(GOOD),
    endingStock: market.stockOf(GOOD),
    ledger: ledger.totals(),
  };
}

/** A business that orders to demand, keeps upkeep under its margin and borrows modestly. */
const GOOD_SETTINGS: BusinessSettings = {
  name: "good",
  periods: 12,
  startingCash: 3_000,
  orderPerPeriod: 40,
  upkeepPerPeriod: 800,
  demandPerPeriod: 40,
  loan: { principal: 6_000, ratePerPeriod: 0.01, periods: 12 },
};

/** The same business with bad settings: it over-orders, pays heavy upkeep and borrows big at 5%. */
const BAD_SETTINGS: BusinessSettings = {
  name: "bad",
  periods: 12,
  startingCash: 3_000,
  orderPerPeriod: 150,
  upkeepPerPeriod: 3_500,
  demandPerPeriod: 40,
  loan: { principal: 30_000, ratePerPeriod: 0.05, periods: 6 },
};

describe("the same business, two settings", () => {
  const bad = runBusiness(BAD_SETTINGS);
  const good = runBusiness(GOOD_SETTINGS);

  test("bad settings go bankrupt and good settings profit", () => {
    console.log(`B5.2 bad  ${JSON.stringify(bad)}`);
    console.log(`B5.2 good ${JSON.stringify(good)}`);
    expect(bad.bankrupt).toBe(true);
    expect(good.bankrupt).toBe(false);
    expect(bad.net).toBeLessThan(0);
    expect(good.net).toBeGreaterThan(0);
    expect(bad.endingCash).toBeLessThan(good.endingCash);
  });

  test("the ledger shows why: over-ordering floods the market, misses upkeep and defaults the loan", () => {
    // Over-ordering pushes supply past demand, so the price falls and buying outruns takings.
    expect(bad.firstPrice).toBe(BASE_PRICE);
    expect(bad.lastPrice).toBeLessThan(BASE_PRICE);
    expect(bad.endingStock).toBeGreaterThan(good.endingStock);
    expect(bad.purchaseSpend).toBeGreaterThan(bad.revenue);
    expect(bad.cashFloor).toBeLessThan(good.cashFloor);

    // Every obligation it could not meet is on the record as a miss, not a silent overdraft.
    expect(bad.missedUpkeepCycles).toBeGreaterThan(0);
    expect(bad.missedLoanPayments).toBeGreaterThanOrEqual(3);
    expect(bad.loanDefaulted).toBe(true);
    expect(bad.loanSettled).toBe(false);
    expect(bad.endingCash).toBeGreaterThanOrEqual(0);

    // Ordering to demand holds the price near the base and pays every obligation.
    expect(good.missedUpkeepCycles).toBe(0);
    expect(good.missedLoanPayments).toBe(0);
    expect(good.loanSettled).toBe(true);
    expect(good.loanOutstanding).toBe(0);
    expect(good.revenue).toBeGreaterThan(good.purchaseSpend);
    expect(good.lastPrice).toBeGreaterThan(BASE_PRICE * 0.8);
    expect(good.lastPrice).toBeLessThan(BASE_PRICE * 1.5);
    expect(bad.interestPaid).toBeGreaterThan(good.interestPaid);
  });

  test("every reason the books moved is in the ledger with its count and net", () => {
    expect(Object.keys(good.ledger).sort()).toEqual(["loan-draw", "loan-interest", "loan-principal", "purchase", "sale", "upkeep"]);
    expect(good.ledger.upkeep).toEqual({ count: 12, net: -9_600 });
    expect(good.ledger["loan-interest"]!.count).toBe(12);
    expect(good.ledger["loan-principal"]!.net).toBe(-6_000);
    expect(good.ledger["loan-draw"]).toEqual({ count: 1, net: 6_000 });

    // The bad run pays far fewer cycles than it owed, and its takings do not cover its buying.
    expect(bad.ledger.upkeep!.count).toBeLessThan(12);
    expect(bad.ledger["loan-interest"]!.count).toBeLessThan(6);
    expect(bad.ledger.sale!.net).toBeLessThan(bad.ledger.purchase!.net * -1);
  });

  test("both runs see the same demand: the difference is the settings, not the dice", () => {
    expect(good.unitsWanted).toBe(bad.unitsWanted);
    expect(good.unitsSold + good.unitsUnsold).toBe(bad.unitsSold + bad.unitsUnsold);
  });

  test("the same settings replayed give the same books", () => {
    expect(runBusiness(GOOD_SETTINGS)).toEqual(good);
    expect(runBusiness(BAD_SETTINGS)).toEqual(bad);
  });
});
