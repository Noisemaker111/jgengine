import { describe, expect, test } from "bun:test";
import {
  balance,
  canAfford,
  charge,
  chargeAll,
  createEmptyWallet,
  grant,
} from "@jgengine/core/economy/wallet";

describe("wallet", () => {
  test("grant accumulates across calls and currencies", () => {
    let wallet = createEmptyWallet();
    wallet = grant(wallet, "money", 100);
    wallet = grant(wallet, "money", 50);
    wallet = grant(wallet, "coins", 10);

    expect(balance(wallet, "money")).toBe(150);
    expect(balance(wallet, "coins")).toBe(10);
  });

  test("charge succeeds and can bring balance to exactly zero", () => {
    let wallet = createEmptyWallet();
    wallet = grant(wallet, "money", 100);

    const result = charge(wallet, "money", 100);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(balance(result.state, "money")).toBe(0);
    }
  });

  test("charge rejects on insufficient funds and leaves original state usable", () => {
    let wallet = createEmptyWallet();
    wallet = grant(wallet, "money", 10);

    const result = charge(wallet, "money", 100);
    expect(result).toEqual({ status: "rejected", reason: "insufficient-funds" });
    expect(balance(wallet, "money")).toBe(10);

    const retry = charge(wallet, "money", 10);
    expect(retry.status).toBe("ok");
  });

  test("balance of unknown currency is 0", () => {
    const wallet = createEmptyWallet();
    expect(balance(wallet, "research-points")).toBe(0);
  });

  test("grant throws on invalid amounts", () => {
    const wallet = createEmptyWallet();
    expect(() => grant(wallet, "money", 0)).toThrow(RangeError);
    expect(() => grant(wallet, "money", -5)).toThrow(RangeError);
    expect(() => grant(wallet, "money", Number.NaN)).toThrow(RangeError);
    expect(() => grant(wallet, "money", Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test("charge throws on invalid amounts", () => {
    const wallet = createEmptyWallet();
    expect(() => charge(wallet, "money", 0)).toThrow(RangeError);
    expect(() => charge(wallet, "money", -5)).toThrow(RangeError);
    expect(() => charge(wallet, "money", Number.NaN)).toThrow(RangeError);
    expect(() => charge(wallet, "money", Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test("canAfford reports true when every currency has enough balance", () => {
    let wallet = createEmptyWallet();
    wallet = grant(wallet, "money", 100);
    wallet = grant(wallet, "coins", 5);

    expect(canAfford(wallet, { money: 50, coins: 5 })).toBe(true);
  });

  test("canAfford reports false when any currency is short", () => {
    let wallet = createEmptyWallet();
    wallet = grant(wallet, "money", 100);
    wallet = grant(wallet, "coins", 2);

    expect(canAfford(wallet, { money: 50, coins: 5 })).toBe(false);
  });

  test("chargeAll deducts every currency atomically on success", () => {
    let wallet = createEmptyWallet();
    wallet = grant(wallet, "money", 100);
    wallet = grant(wallet, "coins", 10);

    const result = chargeAll(wallet, { money: 40, coins: 10 });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(balance(result.state, "money")).toBe(60);
      expect(balance(result.state, "coins")).toBe(0);
    }
  });

  test("chargeAll rejects the whole charge if one currency is insufficient, with no partial deduction", () => {
    let wallet = createEmptyWallet();
    wallet = grant(wallet, "money", 100);
    wallet = grant(wallet, "coins", 3);

    const result = chargeAll(wallet, { money: 40, coins: 10 });
    expect(result).toEqual({ status: "rejected", reason: "insufficient-funds" });
    expect(balance(wallet, "money")).toBe(100);
    expect(balance(wallet, "coins")).toBe(3);
  });
});
