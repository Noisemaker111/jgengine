import { describe, expect, test } from "bun:test";
import { rollCheck } from "./rollCheck";

function fixedRng(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

describe("rollCheck", () => {
  test("succeeds when the total meets the DC", () => {
    const result = rollCheck({ modifier: 5, dc: 15 }, fixedRng(0.5));
    expect(result.roll).toBe(11);
    expect(result.total).toBe(16);
    expect(result.success).toBe(true);
  });

  test("fails when the total falls short of the DC", () => {
    const result = rollCheck({ modifier: 0, dc: 15 }, fixedRng(0.05));
    expect(result.roll).toBe(2);
    expect(result.success).toBe(false);
  });

  test("advantage takes the higher of two rolls", () => {
    const result = rollCheck({ modifier: 0, dc: 10, advantage: "advantage" }, fixedRng(0.1, 0.9));
    expect(result.rolls).toEqual([3, 19]);
    expect(result.roll).toBe(19);
  });

  test("disadvantage takes the lower of two rolls", () => {
    const result = rollCheck({ modifier: 0, dc: 10, advantage: "disadvantage" }, fixedRng(0.1, 0.9));
    expect(result.rolls).toEqual([3, 19]);
    expect(result.roll).toBe(3);
  });

  test("flags a natural 20 as a critical success", () => {
    const result = rollCheck({ modifier: 0, dc: 100 }, fixedRng(0.99999));
    expect(result.roll).toBe(20);
    expect(result.critical).toBe("success");
  });

  test("flags a natural 1 as a critical failure", () => {
    const result = rollCheck({ modifier: 20, dc: 5 }, fixedRng(0));
    expect(result.roll).toBe(1);
    expect(result.critical).toBe("failure");
  });
});
