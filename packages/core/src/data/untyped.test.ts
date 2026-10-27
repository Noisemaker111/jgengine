import { describe, expect, test } from "bun:test";

import { isFiniteNumber, isRecord, typedRecord } from "./untyped";

describe("untyped reads", () => {
  test("a record is a plain object, not null or a list", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([1])).toBe(false);
    expect(isRecord("x")).toBe(false);
  });

  test("a finite number excludes NaN, infinity and text", () => {
    expect(isFiniteNumber(3)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber("3")).toBe(false);
  });

  test("a typed map keeps every entry or refuses the whole value", () => {
    expect(typedRecord({ a: 1, b: 2 }, isFiniteNumber)).toEqual({ a: 1, b: 2 });
    expect(typedRecord({ a: 1, b: "2" }, isFiniteNumber)).toBeNull();
    expect(typedRecord([1, 2], isFiniteNumber)).toBeNull();
    expect(typedRecord({}, isFiniteNumber)).toEqual({});
  });
});
