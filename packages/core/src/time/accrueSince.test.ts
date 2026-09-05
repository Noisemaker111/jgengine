import { expect, test } from "bun:test";
import { accrueSince } from "./accrueSince";

test("accrual settles elapsed time and caps a dormant return without replaying it", () => {
  expect(accrueSince(1000, 2500)).toEqual({ elapsedMs: 1500, elapsedSeconds: 1.5, anchorMs: 2500 });
  const capped = accrueSince(1000, 101000, { capMs: 30000 });
  expect(capped.elapsedSeconds).toBe(30);
  expect(accrueSince(capped.anchorMs, 101000).elapsedMs).toBe(0);
  expect(accrueSince(1000, 500)).toEqual({ elapsedMs: 0, elapsedSeconds: 0, anchorMs: 1000 });
  expect(accrueSince(1000, 2000, { capMs: 0 }).elapsedMs).toBe(0);
  expect(() => accrueSince(NaN, 2000)).toThrow();
  expect(() => accrueSince(1000, Infinity)).toThrow();
  expect(() => accrueSince(1000, 2000, { capMs: -1 })).toThrow();
});
