import { describe, expect, test } from "bun:test";
import {
  computeBillLateFee,
  computeDailyBills,
  decideBillAutoPay,
  isBillOverdue,
  shouldSpawnDailyBills,
} from "@llmville/game/economy/billing";
import { cellRentForCount } from "@llmville/game/datacenter/claims";

describe("billing", () => {
  test("shouldSpawnDailyBills skips creation day and already-billed days", () => {
    const createdAt = 1_000_000;
    const now = createdAt + 60_000;
    expect(
      shouldSpawnDailyBills({
        now,
        createdAt,
        gameTimeScale: 60,
        lastBilledGameDay: undefined,
      }),
    ).toBe(false);
  });

  test("shouldSpawnDailyBills allows a later game day", () => {
    const createdAt = 1_000_000;
    const now = createdAt + 24 * 60 * 60 * 1000;
    expect(
      shouldSpawnDailyBills({
        now,
        createdAt,
        gameTimeScale: 60,
        lastBilledGameDay: 0,
      }),
    ).toBe(true);
  });

  test("computeDailyBills adds per-cell datacenter rent from claimedCellCount", () => {
    const createdAt = 1_000_000;
    const baseInputs = {
      now: createdAt + 24 * 60 * 60 * 1000,
      createdAt,
      gameTimeScale: 60,
      lastBilledGameDay: 0,
      racks: [],
      hasActiveCompute: false,
      electricityBillMultiplier: 1,
    };

    const without = computeDailyBills({ ...baseInputs, claimedCellCount: 0 });
    if (without.kind !== "spawn") throw new Error("expected spawn");
    expect(without.bills.filter((bill) => bill.billType === "rent")).toHaveLength(0);

    const withCells = computeDailyBills({ ...baseInputs, claimedCellCount: 3 });
    if (withCells.kind !== "spawn") throw new Error("expected spawn");
    const rentBills = withCells.bills.filter((bill) => bill.billType === "rent");
    expect(rentBills).toHaveLength(1);
    expect(rentBills.some((bill) => bill.amount === cellRentForCount(3))).toBe(true);
  });
});

describe("bill collection", () => {
  const gameDayMs = 60_000;
  const bill = { amount: 100, aprRate: 0.1, dueAt: 1_000_000 };

  test("late fees accrue per game day past the due date", () => {
    expect(computeBillLateFee(bill, bill.dueAt, 1440)).toBe(0);
    expect(computeBillLateFee(bill, bill.dueAt + 2 * gameDayMs, 1440)).toBe(20);
  });

  test("isBillOverdue only after the grace window in dueAt", () => {
    expect(isBillOverdue(bill, bill.dueAt)).toBe(false);
    expect(isBillOverdue(bill, bill.dueAt + 1)).toBe(true);
  });

  test("pays when the lab has the cash", () => {
    const decision = decideBillAutoPay({
      bill,
      now: bill.dueAt + gameDayMs,
      timeScale: 1440,
      money: 500,
      liquidationValue: 0,
    });
    expect(decision.kind).toBe("pay");
    expect(decision.totalDue).toBe(110);
  });

  test("defers an unpayable bill that is still inside its grace window", () => {
    expect(
      decideBillAutoPay({
        bill,
        now: bill.dueAt - 1,
        timeScale: 1440,
        money: 0,
        liquidationValue: 0,
      }).kind,
    ).toBe("defer");
  });

  test("liquidates once overdue and assets still cover the debt", () => {
    expect(
      decideBillAutoPay({
        bill,
        now: bill.dueAt + gameDayMs,
        timeScale: 1440,
        money: 0,
        liquidationValue: 500,
      }).kind,
    ).toBe("liquidate");
  });

  test("re-running a collection pass does not compound the late fee", () => {
    const later = bill.dueAt + 3 * gameDayMs;
    const first = decideBillAutoPay({ bill, now: later, timeScale: 1440, money: 0, liquidationValue: 0 });
    const second = decideBillAutoPay({
      bill: { ...bill, lateFeeAccrued: first.lateFeeAccrued },
      now: later,
      timeScale: 1440,
      money: 0,
      liquidationValue: 0,
    });
    expect(second.lateFeeAccrued).toBe(first.lateFeeAccrued);
    expect(second.totalDue).toBe(first.totalDue);
  });

  test("is insolvent when nothing the lab owns covers an overdue bill", () => {
    expect(
      decideBillAutoPay({
        bill,
        now: bill.dueAt + gameDayMs,
        timeScale: 1440,
        money: 10,
        liquidationValue: 10,
      }).kind,
    ).toBe("insolvent");
  });
});
