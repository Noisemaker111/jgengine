import { describe, expect, test } from "bun:test";

import type { HandCategory } from "./evaluator";
import { PAY_PER_CREDIT, PAYTABLE_ROWS, payColumn, payout } from "./paytable";

describe("paytable — 9/6 Jacks or Better", () => {
  test("per-credit base values match the classic 9/6 schedule", () => {
    expect(PAY_PER_CREDIT).toEqual({
      royal_flush: 250,
      straight_flush: 50,
      four_kind: 25,
      full_house: 9,
      flush: 6,
      straight: 4,
      three_kind: 3,
      two_pair: 2,
      jacks_or_better: 1,
    });
  });

  test("payouts scale linearly with the bet", () => {
    expect(payout("jacks_or_better", 1)).toBe(1);
    expect(payout("jacks_or_better", 5)).toBe(5);
    expect(payout("two_pair", 5)).toBe(10);
    expect(payout("three_kind", 5)).toBe(15);
    expect(payout("straight", 4)).toBe(16);
    expect(payout("flush", 2)).toBe(12);
    expect(payout("full_house", 3)).toBe(27);
    expect(payout("four_kind", 5)).toBe(125);
    expect(payout("straight_flush", 5)).toBe(250);
  });

  test("royal flush jackpots to 4000 only at max bet", () => {
    expect(payout("royal_flush", 1)).toBe(250);
    expect(payout("royal_flush", 2)).toBe(500);
    expect(payout("royal_flush", 3)).toBe(750);
    expect(payout("royal_flush", 4)).toBe(1000);
    expect(payout("royal_flush", 5)).toBe(4000);
  });

  test("payColumn mirrors payout for every row and bet 1..5", () => {
    for (const row of PAYTABLE_ROWS) {
      for (let bet = 1; bet <= 5; bet += 1) {
        expect(payColumn(row, bet)).toBe(payout(row, bet));
      }
    }
  });

  test("a non-paying hand pays zero at any bet", () => {
    const nothing: HandCategory = "nothing";
    expect(payout(nothing, 1)).toBe(0);
    expect(payout(nothing, 5)).toBe(0);
  });

  test("every paytable row has a per-credit value", () => {
    for (const row of PAYTABLE_ROWS) {
      expect(PAY_PER_CREDIT[row]).toBeGreaterThan(0);
    }
    expect(PAYTABLE_ROWS.length).toBe(9);
  });
});
