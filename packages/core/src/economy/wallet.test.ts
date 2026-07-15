import { describe, expect, test } from "bun:test";
import {
  balance,
  canAfford,
  charge,
  chargeAll,
  createEmptyWallet,
  grant,
  isOverdrawn,
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

describe("wallet overdraft", () => {
  test("charge without overdraft still rejects into the red (strict default unchanged)", () => {
    const wallet = createEmptyWallet();
    expect(charge(wallet, "money", 10)).toEqual({ status: "rejected", reason: "insufficient-funds" });
  });

  test("charge with overdraft: true carries an unlimited debt balance", () => {
    const wallet = createEmptyWallet();
    const result = charge(wallet, "money", 250, { overdraft: true });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(balance(result.state, "money")).toBe(-250);
      expect(isOverdrawn(result.state, "money")).toBe(true);
    }
  });

  test("charge with a capped overdraft rejects once the debt limit would be exceeded", () => {
    let wallet = createEmptyWallet();
    const first = charge(wallet, "money", 80, { overdraft: { max: 100 } });
    expect(first.status).toBe("ok");
    if (first.status === "ok") wallet = first.state;
    expect(balance(wallet, "money")).toBe(-80);

    const second = charge(wallet, "money", 50, { overdraft: { max: 100 } });
    expect(second).toEqual({ status: "rejected", reason: "insufficient-funds" });
    expect(balance(wallet, "money")).toBe(-80);
  });

  test("grant tolerates and repays a negative balance", () => {
    let wallet = createEmptyWallet();
    const charged = charge(wallet, "money", 40, { overdraft: true });
    if (charged.status === "ok") wallet = charged.state;
    expect(balance(wallet, "money")).toBe(-40);

    wallet = grant(wallet, "money", 100);
    expect(balance(wallet, "money")).toBe(60);
    expect(isOverdrawn(wallet, "money")).toBe(false);
  });

  test("chargeAll with overdraft lets one currency go negative while another stays solvent", () => {
    let wallet = createEmptyWallet();
    wallet = grant(wallet, "coins", 5);
    const result = chargeAll(wallet, { money: 30, coins: 5 }, { overdraft: true });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(balance(result.state, "money")).toBe(-30);
      expect(balance(result.state, "coins")).toBe(0);
    }
  });

  test("chargeAll with a capped overdraft rejects (and deducts nothing) when any currency would exceed its limit", () => {
    const wallet = createEmptyWallet();
    const result = chargeAll(wallet, { money: 200 }, { overdraft: { max: 50 } });
    expect(result).toEqual({ status: "rejected", reason: "insufficient-funds" });
    expect(balance(wallet, "money")).toBe(0);
  });
});
