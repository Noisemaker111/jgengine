import { expect, test } from "bun:test";
import { applyCurrencyOperation, formatCurrency, toMinorUnits } from "./currency";
import { balance, charge, createEmptyWallet, grant } from "./wallet";

const dollars = { id: "cash", name: "Cash", symbol: "$", decimals: 2 };

test("currency decimal operations do integer arithmetic and round at writes", () => {
  expect(applyCurrencyOperation(dollars, 0.1, "add", 0.2)).toEqual({ success: true, newBalance: 0.3, appliedDelta: 0.2 });
  expect(toMinorUnits(dollars, 1.005)).toBe(101);
  expect(applyCurrencyOperation(dollars, 1, "deduct", 1.01).success).toBe(false);
  expect(applyCurrencyOperation(dollars, 1, "add", NaN).success).toBe(false);
  expect(applyCurrencyOperation(dollars, 1, "deduct", -1).success).toBe(false);
  expect(formatCurrency(dollars, 12.1)).toBe("$12.10");
  expect(formatCurrency({ id: "gold", name: "Gold" }, 12.6)).toBe("13");
});

test("sub-dollar income accrues and wallets accept the currency precision policy", () => {
  let state = createEmptyWallet();
  for (let minute = 0; minute < 60; minute++) state = grant(state, dollars, 0.005 * 60);
  state = JSON.parse(JSON.stringify(state));
  expect(balance(state, dollars)).toBe(18);
  const charged = charge(state, dollars, 17.99);
  expect(charged.status).toBe("ok");
  if (charged.status === "ok") expect(balance(charged.state, dollars)).toBe(0.01);
  expect(charge(state, dollars, 18.01).status).toBe("rejected");
});

test("currency rejects unsafe magnitudes and invalid precision", () => {
  for (const value of [Infinity, NaN, Number.MAX_SAFE_INTEGER]) expect(() => toMinorUnits(dollars, value)).toThrow();
  for (const decimals of [-1, 1.5, 10]) expect(() => toMinorUnits({ decimals }, 1)).toThrow();
});
