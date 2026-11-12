import { describe, expect, test } from "bun:test";
import { coefficientOfVariation, mean, quantile, spearman } from "./stats";

describe("stats", () => {
  test("mean and quantiles skip non-finite entries and read NaN when empty", () => {
    expect(mean([1, 2, 3, Number.NaN, Infinity])).toBe(2);
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(quantile([4, 1, 3, 2], 0)).toBe(1);
    expect(quantile([4, 1, 3, 2], 1)).toBe(4);
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1, 12);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });

  test("coefficient of variation is spread over mean", () => {
    expect(coefficientOfVariation([5, 5, 5])).toBe(0);
    expect(coefficientOfVariation([1, 3])).toBeCloseTo(0.5, 12);
  });

  test("spearman is ±1 for monotone pairs, tie-aware, NaN without spread", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 25, 100])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [9, 7, 3, -1])).toBeCloseTo(-1, 12);
    expect(spearman([1, 2, 3], [1, 1, 2])).toBeCloseTo(0.8660254, 6);
    expect(Number.isNaN(spearman([1, 2, 3], [5, 5, 5]))).toBe(true);
  });
});
