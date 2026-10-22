import { describe, expect, test } from "bun:test";

import { gateTimingMs } from "../../../../scripts/timing-budget";
import { devtools } from "../devtools/devtools";
import { createTransactionLedger, type RecurringCharge } from "./transactionLedger";

function upkeep(overrides: Partial<RecurringCharge> = {}): RecurringCharge {
  return {
    id: "rent",
    account: "biz",
    currency: "cents",
    amountPerPeriod: 1_000,
    everySeconds: 60,
    startSeconds: 60,
    reason: "upkeep",
    ...overrides,
  };
}

function books(startingCash = 10_000) {
  const ledger = createTransactionLedger();
  ledger.openAccount("biz", "cents", startingCash);
  return ledger;
}

describe("journal", () => {
  test("every post keeps its reason, the balance it produced and a monotonic sequence", () => {
    const ledger = books();
    const sale = ledger.post({ at: 10, account: "biz", currency: "cents", amount: 2_500, reason: "sale", ref: "grain" });
    expect(sale).toEqual({
      ok: true,
      entry: { seq: 1, at: 10, account: "biz", currency: "cents", amount: 2_500, balanceAfter: 12_500, reason: "sale", ref: "grain" },
    });
    expect(ledger.post({ at: 11, account: "biz", currency: "cents", amount: -500, reason: "purchase" })).toMatchObject({
      ok: true,
      entry: { seq: 2, balanceAfter: 12_000, reason: "purchase" },
    });
    expect(ledger.balanceOf("biz", "cents")).toBe(12_000);
    expect(ledger.entries()).toHaveLength(2);
    expect(ledger.entries({ reason: "sale" })).toHaveLength(1);
    expect(ledger.entries({ since: 11 })).toHaveLength(1);
    expect(ledger.entries({ limit: 1 })[0]!.seq).toBe(2);
    expect(ledger.entries()[0]).not.toBe(ledger.entries()[0]);
  });

  test("a post that cannot be applied is refused without touching the books", () => {
    const ledger = books(500);
    expect(ledger.post({ at: 1, account: "ghost", currency: "cents", amount: 1, reason: "sale" })).toEqual({ ok: false, reason: "unknown-account" });
    expect(ledger.post({ at: 1, account: "biz", currency: "cents", amount: 0, reason: "sale" })).toEqual({ ok: false, reason: "invalid-amount" });
    expect(ledger.post({ at: 1, account: "biz", currency: "cents", amount: 1.5, reason: "sale" })).toEqual({ ok: false, reason: "invalid-amount" });
    expect(ledger.post({ at: 1, account: "biz", currency: "cents", amount: 2 ** 53, reason: "sale" })).toEqual({ ok: false, reason: "invalid-amount" });
    expect(ledger.post({ at: 1, account: "biz", currency: "cents", amount: -1, reason: "  " })).toEqual({ ok: false, reason: "invalid-reason" });
    expect(ledger.post({ at: 1, account: "biz", currency: "cents", amount: -501, reason: "upkeep" })).toEqual({ ok: false, reason: "insufficient-funds" });
    expect(ledger.balanceOf("biz", "cents")).toBe(500);
    expect(ledger.entries()).toHaveLength(0);
    expect(ledger.stats().seq).toBe(0);
  });

  test("overdraft is opt-in per post and can be capped", () => {
    const ledger = books(1_000);
    expect(ledger.post({ at: 1, account: "biz", currency: "cents", amount: -1_500, reason: "upkeep", overdraft: true })).toMatchObject({ ok: true });
    expect(ledger.balanceOf("biz", "cents")).toBe(-500);
    expect(ledger.post({ at: 2, account: "biz", currency: "cents", amount: -600, reason: "upkeep", overdraft: { max: 1_000 } })).toEqual({ ok: false, reason: "insufficient-funds" });
    expect(ledger.post({ at: 2, account: "biz", currency: "cents", amount: -500, reason: "upkeep", overdraft: { max: 1_000 } })).toMatchObject({ ok: true });
    expect(ledger.balanceOf("biz", "cents")).toBe(-1_000);
  });

  test("totals by reason survive the journal's entry cap", () => {
    const ledger = createTransactionLedger({ maxEntries: 3 });
    ledger.openAccount("biz", "cents", 0);
    for (let i = 0; i < 5; i += 1) ledger.post({ at: i, account: "biz", currency: "cents", amount: 100, reason: "sale" });
    ledger.post({ at: 9, account: "biz", currency: "cents", amount: -50, reason: "upkeep" });
    expect(ledger.entries()).toHaveLength(3);
    expect(ledger.stats().seq).toBe(6);
    expect(ledger.totals()).toEqual({ sale: { count: 5, net: 500 }, upkeep: { count: 1, net: -50 } });
  });
});

describe("recurring charges on a cadence", () => {
  test("upkeep is charged on its cadence and nothing fires before it is due", () => {
    const ledger = books();
    expect(ledger.addCharge(upkeep())).toBe(true);
    expect(ledger.chargeDue(0)).toEqual({ charged: [], missed: [] });
    expect(ledger.balanceOf("biz", "cents")).toBe(10_000);

    const result = ledger.chargeDue(180);
    expect(result.missed).toEqual([]);
    expect(result.charged.map((entry) => entry.at)).toEqual([60, 120, 180]);
    expect(result.charged.every((entry) => entry.reason === "upkeep" && entry.ref === "rent" && entry.amount === -1_000)).toBe(true);
    expect(ledger.balanceOf("biz", "cents")).toBe(7_000);
    expect(ledger.chargeDue(180)).toEqual({ charged: [], missed: [] });
  });

  test("catch-up policy decides how missed cycles are settled", () => {
    const summed = books();
    summed.addCharge(upkeep({ catchUp: "sum" }));
    expect(summed.chargeDue(180).charged).toEqual([
      { seq: 1, at: 180, account: "biz", currency: "cents", amount: -3_000, balanceAfter: 7_000, reason: "upkeep", ref: "rent" },
    ]);

    const skipped = books();
    skipped.addCharge(upkeep({ catchUp: "skip" }));
    expect(skipped.chargeDue(180).charged).toMatchObject([{ at: 180, amount: -1_000 }]);
    expect(skipped.balanceOf("biz", "cents")).toBe(9_000);
  });

  test("a long idle gap is bounded per charge and per advance", () => {
    const dropped = books(1_000_000);
    dropped.addCharge(upkeep({ maxCatchUp: 2 }));
    expect(dropped.chargeDue(600).charged).toHaveLength(2);
    expect(dropped.balanceOf("biz", "cents")).toBe(998_000);
    expect(dropped.chargeDue(600).charged).toHaveLength(0);

    const bounded = createTransactionLedger({ maxCyclesPerAdvance: 1 });
    bounded.openAccount("biz", "cents", 1_000_000);
    bounded.addCharge(upkeep());
    expect(bounded.chargeDue(600).charged).toHaveLength(1);
    expect(bounded.chargeDue(600).charged).toHaveLength(0);
  });

  test("a cycle with no funds is counted as missed instead of overdrawing", () => {
    const ledger = books(1_500);
    ledger.addCharge(upkeep());
    const result = ledger.chargeDue(180);
    expect(result.charged).toHaveLength(1);
    expect(result.missed).toEqual([{ id: "rent", cycles: 2 }]);
    expect(ledger.balanceOf("biz", "cents")).toBe(500);
    expect(ledger.entries({ reason: "upkeep" })).toHaveLength(1);
  });

  test("charges are validated, removable and refuse a duplicate id", () => {
    const ledger = books();
    expect(ledger.addCharge(upkeep())).toBe(true);
    expect(ledger.addCharge(upkeep())).toBe(false);
    expect(ledger.addCharge(upkeep({ id: "bad", amountPerPeriod: 0 }))).toBe(false);
    expect(ledger.addCharge(upkeep({ id: "bad", everySeconds: 0 }))).toBe(false);
    expect(ledger.addCharge(upkeep({ id: "bad", reason: "" }))).toBe(false);
    expect(ledger.removeCharge("rent")).toBe(true);
    expect(ledger.removeCharge("rent")).toBe(false);
    expect(ledger.chargeDue(600).charged).toEqual([]);
  });

  test("the clock cannot rewind", () => {
    const ledger = books();
    ledger.chargeDue(100);
    expect(() => ledger.chargeDue(99)).toThrow("cannot rewind");
  });
});

describe("state and probe", () => {
  test("snapshot and restore round-trip balances, journal, totals and cursors through JSON", () => {
    const ledger = books();
    ledger.addCharge(upkeep());
    ledger.post({ at: 5, account: "biz", currency: "cents", amount: 2_000, reason: "sale", ref: "grain" });
    ledger.chargeDue(120);

    const snapshot = JSON.parse(JSON.stringify(ledger.snapshot()));
    const restored = createTransactionLedger();
    expect(restored.restore(snapshot)).toBe(true);
    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.balanceOf("biz", "cents")).toBe(ledger.balanceOf("biz", "cents"));
    expect(restored.totals()).toEqual(ledger.totals());
    expect(restored.chargeDue(180).charged).toHaveLength(1);
  });

  test("restore refuses malformed state without mutating", () => {
    const ledger = books();
    ledger.post({ at: 1, account: "biz", currency: "cents", amount: 1, reason: "sale" });
    const before = ledger.snapshot();
    expect(ledger.restore({ ...before, seq: -1 })).toBe(false);
    expect(ledger.restore({ ...before, nowSeconds: -1 })).toBe(false);
    expect(ledger.restore({ ...before, accounts: { biz: { cents: 1.5 } } })).toBe(false);
    expect(ledger.restore({ ...before, entries: [{ ...before.entries[0]!, seq: 0 }] })).toBe(false);
    expect(ledger.restore({ ...before, entries: [{ ...before.entries[0]!, reason: "" }] })).toBe(false);
    expect(ledger.restore({ ...before, totals: { sale: { count: 1, net: 0.5 } } })).toBe(false);
    expect(ledger.restore({ ...before, charges: { rent: upkeep() } })).toBe(false);
    expect(ledger.snapshot()).toEqual(before);
  });

  test("stats and the probe report the books; reset clears them", () => {
    const ledger = createTransactionLedger({ devtoolsName: "ledger.test" });
    ledger.openAccount("biz", "cents", 100);
    ledger.post({ at: 1, account: "biz", currency: "cents", amount: 10, reason: "sale" });
    ledger.addCharge(upkeep());
    expect(ledger.stats()).toEqual({ accounts: 1, entries: 1, charges: 1, seq: 1 });
    expect(devtools.probes.read()["ledger.test"]).toEqual({
      accounts: 1,
      entries: 1,
      charges: 1,
      seq: 1,
      totals: { sale: { count: 1, net: 10 } },
    });
    ledger.reset();
    expect(ledger.stats()).toEqual({ accounts: 0, entries: 0, charges: 0, seq: 0 });
    ledger.dispose();
    expect(devtools.probes.read()["ledger.test"]).toBeUndefined();
  });

  test("opening an account twice keeps the balance and adds a currency", () => {
    const ledger = books(700);
    ledger.openAccount("biz", "cents", 999);
    ledger.openAccount("biz", "scrip", 5);
    expect(ledger.balanceOf("biz", "cents")).toBe(700);
    expect(ledger.balanceOf("biz", "scrip")).toBe(5);
    expect(ledger.accounts()).toEqual({ biz: { cents: 700, scrip: 5 } });
  });
});

describe("bounded per-tick cost", () => {
  test("posts and a due settle stay flat", () => {
    const samples: number[] = [];
    for (let run = 0; run < 7; run += 1) {
      const ledger = createTransactionLedger();
      ledger.openAccount("biz", "cents", 1_000_000);
      for (let i = 0; i < 50; i += 1) ledger.addCharge(upkeep({ id: `charge-${i}`, amountPerPeriod: 10 }));
      const started = performance.now();
      for (let tick = 0; tick < 50; tick += 1) {
        ledger.post({ at: tick, account: "biz", currency: "cents", amount: 1, reason: "sale" });
        ledger.chargeDue(tick);
      }
      samples.push(performance.now() - started);
    }
    gateTimingMs("ledger posts and due settle", samples, 8, "50 posts + 50 charges due per tick x 50 ticks");
  });
});
