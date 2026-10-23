import { describe, expect, test } from "bun:test";

import { createCareerBank, type CareerBankState } from "@jgengine/core/progression/careerBank";

const CREDITS = { id: "credits", name: "Credits" };

describe("career bank", () => {
  test("a run's haul banks only on a cash-out", () => {
    const bank = createCareerBank({ currency: CREDITS, start: 250 });
    expect(bank.earn(180)).toBe(180);
    expect(bank.banked()).toBe(250);
    expect(bank.haul()).toBe(180);

    expect(bank.cashOut()).toEqual({ deposited: 180, banked: 430 });
    expect(bank.banked()).toBe(430);
    expect(bank.haul()).toBe(0);
  });

  test("a failed run loses the haul and keeps the bank", () => {
    const bank = createCareerBank({ currency: CREDITS, start: 100 });
    bank.earn(75);
    expect(bank.loseHaul()).toEqual({ lost: 75, banked: 100 });
    expect(bank.banked()).toBe(100);
    expect(bank.haul()).toBe(0);
    expect(bank.counters()).toEqual({ deposited: 0, lost: 75, bestHaul: 0, runs: 1 });
  });

  test("spending comes from the bank and refuses when short", () => {
    const bank = createCareerBank({ currency: CREDITS, start: 300 });
    expect(bank.afford(200)).toBe(true);
    expect(bank.spend(200)).toBe(true);
    expect(bank.banked()).toBe(100);
    expect(bank.spend(200)).toBe(false);
    expect(bank.banked()).toBe(100);
    expect(bank.haul()).toBe(0);
  });

  test("the haul cap holds a single run's takings", () => {
    const bank = createCareerBank({ currency: CREDITS, haulCap: 50 });
    expect(bank.earn(30)).toBe(30);
    expect(bank.earn(40)).toBe(50);
    expect(bank.earn(-10)).toBe(50);
  });

  test("decimals are snapped at the write boundary", () => {
    const bank = createCareerBank({ currency: { id: "dollars", name: "Dollars", decimals: 2 } });
    bank.earn(0.005);
    expect(bank.haul()).toBe(0.01);
    bank.earn(1.234);
    expect(bank.haul()).toBe(1.24);
  });

  test("snapshot and restore round-trip money and counters", () => {
    const bank = createCareerBank({ currency: CREDITS, start: 500 });
    bank.earn(120);
    bank.cashOut();
    bank.earn(40);
    bank.loseHaul();
    const state = JSON.parse(JSON.stringify(bank.snapshot())) as CareerBankState;

    const restored = createCareerBank({ currency: CREDITS });
    restored.restore(state);
    expect(restored.banked()).toBe(620);
    expect(restored.haul()).toBe(0);
    expect(restored.counters()).toEqual(bank.counters());
    expect(restored.snapshot()).toEqual(bank.snapshot());
  });

  test("the same sequence of runs produces the same money", () => {
    const play = (): string => {
      const bank = createCareerBank({ currency: CREDITS, start: 1000 });
      for (let index = 0; index < 4; index += 1) {
        bank.earn(60 + index * 15);
        if (index % 2 === 0) bank.cashOut();
        else bank.loseHaul();
      }
      return JSON.stringify(bank.snapshot());
    };
    expect(play()).toBe(play());
  });
});
