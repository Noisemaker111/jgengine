import { expect, test } from "bun:test";
import { decideRateWindow } from "./rateWindow";

test("sliding rate windows reject bursts and reopen exactly at expiry", () => {
  const policy = { windowMs: 2000, max: 2 };
  const first = decideRateWindow([], 1000, policy);
  const second = decideRateWindow(first.timestamps, 1500, policy);
  expect(second.allowed).toBe(true);
  expect(decideRateWindow(second.timestamps, 2000, policy)).toEqual({ allowed: false, timestamps: [1000, 1500], retryAfterMs: 1000 });
  expect(decideRateWindow(second.timestamps, 3000, policy)).toEqual({ allowed: true, timestamps: [1500, 3000], retryAfterMs: 0 });
  expect(second.timestamps).toEqual([1000, 1500]);
  expect(decideRateWindow([3000], 1000, { windowMs: 2000, max: 1 }).allowed).toBe(false);
  expect(() => decideRateWindow([], 0, { windowMs: 0, max: 1 })).toThrow();
  expect(() => decideRateWindow([], 0, { windowMs: 1000, max: 1.5 })).toThrow();
});
