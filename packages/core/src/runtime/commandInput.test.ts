import { expect, test } from "bun:test";
import { readQuantity } from "./commandInput";

test("purchase quantities reject malformed and out of bounds input without coercion", () => {
  for (const value of [NaN, Infinity, -Infinity, -1, 0, 1.5, 101, "2", null, {}, undefined]) {
    expect(readQuantity(value, { min: 1, max: 100 })).toEqual({ ok: false, reason: "invalid-quantity" });
  }
  expect(readQuantity(100, { min: 1, max: 100 })).toEqual({ ok: true, quantity: 100 });
  expect(readQuantity(0, { min: 0 })).toEqual({ ok: true, quantity: 0 });
  expect(() => readQuantity(1, { min: 2, max: 1 })).toThrow();
});
