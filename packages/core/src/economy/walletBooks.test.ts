import { describe, expect, test } from "bun:test";

import { createWalletBooks } from "./walletBooks";

function wallet(start: Record<string, number> = {}) {
  const balances: Record<string, number> = { ...start };
  return {
    balances,
    balance: (currency: string) => balances[currency] ?? 0,
    grant: (currency: string, amount: number) => { balances[currency] = (balances[currency] ?? 0) + amount; },
  };
}

const sum = (amounts: readonly { amount: number }[]) => amounts.reduce((total, entry) => total + entry.amount, 0);

describe("wallet books", () => {
  test("without an opening reason the accounts open at the live balance; with one the history explains it", () => {
    const live = wallet({ gold: 40 });
    const square = createWalletBooks({ account: "p", currencies: ["gold"], balance: live.balance, now: () => 0 });
    expect(square.entries()).toEqual([]);
    expect(square.balanceOf("gold")).toBe(40);

    const explained = createWalletBooks({ account: "p", currencies: ["gold"], balance: live.balance, now: () => 0, opening: "opening" });
    expect(explained.entries().map((entry) => [entry.reason, entry.amount])).toEqual([["opening", 40]]);
  });

  test("track posts what a mutation moved in each currency; record posts what already moved", () => {
    let clock = 1;
    const live = wallet();
    const books = createWalletBooks({ account: "p", currencies: ["gold", "wood"], balance: live.balance, now: () => clock });
    books.track("trade", () => { live.grant("gold", 10); live.grant("wood", -3); }, "caravan");
    clock = 2;
    live.grant("gold", 7);
    books.record("gold", 7, "bounty");
    expect(books.entries().map((entry) => [entry.at, entry.reason, entry.currency, entry.amount, entry.ref])).toEqual([
      [1, "trade", "gold", 10, "caravan"],
      [1, "trade", "wood", -3, "caravan"],
      [2, "bounty", "gold", 7, undefined],
    ]);
    expect(books.unexplained()).toEqual({ gold: 0, wood: 0 });
  });

  test("a change the books never saw posts under the unexplained reason before the next movement", () => {
    const live = wallet({ gold: 5 });
    const books = createWalletBooks({ account: "p", currencies: ["gold"], balance: live.balance, now: () => 0, unexplained: "host-write" });
    live.grant("gold", 20); // a host write, a load
    expect(books.unexplained()).toEqual({ gold: 20 });
    live.grant("gold", 3);
    books.record("gold", 3, "bounty");
    expect(books.entries().map((entry) => [entry.reason, entry.amount])).toEqual([["host-write", 20], ["bounty", 3]]);
    expect(books.balanceOf("gold")).toBe(live.balance("gold"));
  });

  test("restore puts a saved journal back and squares it to the live balance; reset reopens", () => {
    const live = wallet();
    const books = createWalletBooks({ account: "p", currencies: ["gold"], balance: live.balance, now: () => 0 });
    books.track("sale", () => live.grant("gold", 12));
    const saved = books.snapshot();
    live.grant("gold", 4);
    books.reset("load");
    expect(books.entries().map((entry) => [entry.reason, entry.amount])).toEqual([["load", 16]]);
    expect(books.restore(saved, "load")).toBe(true);
    expect(books.entries().map((entry) => [entry.reason, entry.amount])).toEqual([["sale", 12], ["load", 4]]);
    expect(sum(books.entries())).toBe(live.balance("gold"));
    expect(books.restore({ ...saved, seq: -1 })).toBe(false);
  });
});
