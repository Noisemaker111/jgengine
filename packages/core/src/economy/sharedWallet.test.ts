import { describe, expect, test } from "bun:test";

import {
  balanceIn,
  chargeFrom,
  contributionOf,
  contributorsOf,
  createWalletBook,
  grantTo,
  groupScope,
  userScope,
} from "./sharedWallet";

describe("shared / group wallet scope", () => {
  test("a group wallet is distinct from each member's personal wallet", () => {
    let book = createWalletBook();
    book = grantTo(book, userScope("alice"), "cash", 100);
    book = grantTo(book, groupScope("company"), "cash", 500, "alice");

    expect(balanceIn(book, userScope("alice"), "cash")).toBe(100);
    expect(balanceIn(book, groupScope("company"), "cash")).toBe(500);
    expect(balanceIn(book, userScope("bob"), "cash")).toBe(0);
  });

  test("multiple co-op players draw from and contribute to one shared pool", () => {
    let book = createWalletBook();
    book = grantTo(book, groupScope("company"), "cash", 300, "alice");
    book = grantTo(book, groupScope("company"), "cash", 200, "bob");
    expect(balanceIn(book, groupScope("company"), "cash")).toBe(500);

    const spend = chargeFrom(book, groupScope("company"), "cash", 450, "bob");
    expect(spend.status).toBe("ok");
    if (spend.status === "ok") book = spend.book;
    expect(balanceIn(book, groupScope("company"), "cash")).toBe(50);
  });

  test("a charge beyond the shared balance is rejected with the pool untouched", () => {
    let book = createWalletBook();
    book = grantTo(book, groupScope("crew"), "quota", 40, "alice");
    const spend = chargeFrom(book, groupScope("crew"), "quota", 100);
    expect(spend).toEqual({ status: "rejected", reason: "insufficient-funds" });
    expect(balanceIn(book, groupScope("crew"), "quota")).toBe(40);
  });

  test("contribution ledger tracks who deposited into the guild bank", () => {
    let book = createWalletBook();
    book = grantTo(book, groupScope("company"), "cash", 300, "alice");
    book = grantTo(book, groupScope("company"), "cash", 200, "bob");
    const spend = chargeFrom(book, groupScope("company"), "cash", 100, "alice");
    if (spend.status === "ok") book = spend.book;

    expect(contributionOf(book, "company", "alice")).toEqual({ cash: 200 });
    expect(contributionOf(book, "company", "bob")).toEqual({ cash: 200 });
    expect(contributorsOf(book, "company").sort()).toEqual(["alice", "bob"]);
  });

  test("per-user charges do not affect the shared pool", () => {
    let book = createWalletBook();
    book = grantTo(book, userScope("alice"), "cash", 100);
    book = grantTo(book, groupScope("company"), "cash", 100);
    const spend = chargeFrom(book, userScope("alice"), "cash", 60);
    if (spend.status === "ok") book = spend.book;

    expect(balanceIn(book, userScope("alice"), "cash")).toBe(40);
    expect(balanceIn(book, groupScope("company"), "cash")).toBe(100);
  });
});
