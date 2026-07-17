import { describe, expect, test } from "bun:test";

import { createParkLedger } from "../session";
import { settleDailyUpkeep } from "./economy";

describe("loopline daily upkeep ledger adoption", () => {
  test("debits upkeep+restock exactly like the raw formula", () => {
    const ledger = createParkLedger();
    const cash = 6000;
    const upkeep = 120;
    const restock = 45;
    const out = settleDailyUpkeep(ledger, cash, upkeep, restock);
    expect(out.cash).toBe(cash - (upkeep + restock)); // identical observable cash
  });

  test("settles exactly one scheduled cycle per day across many days", () => {
    let ledger = createParkLedger();
    let cash = 6000;
    for (let day = 0; day < 5; day += 1) {
      const out = settleDailyUpkeep(ledger, cash, 100, 0);
      ledger = out.ledger;
      cash = out.cash;
    }
    expect(cash).toBe(6000 - 5 * 100);
    expect(ledger.cursors["daily-upkeep"]!.fired).toBe(5);
  });

  test("absorbs intraday cash changes by re-seeding the park balance", () => {
    const ledger = createParkLedger();
    // Cash grew during the day from ticket sales before the nightly upkeep runs.
    const out = settleDailyUpkeep(ledger, 6500, 200, 50);
    expect(out.cash).toBe(6500 - 250);
  });

  test("ledger state serializes and resumes deterministically", () => {
    let ledger = createParkLedger();
    let cash = 6000;
    ({ ledger, cash } = settleDailyUpkeep(ledger, cash, 100, 20));
    const restored = JSON.parse(JSON.stringify(ledger));
    const live = settleDailyUpkeep(ledger, cash, 80, 10);
    const fromSave = settleDailyUpkeep(restored, cash, 80, 10);
    expect(fromSave.cash).toBe(live.cash);
    expect(fromSave.ledger).toEqual(live.ledger);
  });
});
