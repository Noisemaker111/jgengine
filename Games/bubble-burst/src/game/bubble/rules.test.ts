import { describe, expect, test } from "bun:test";

import { dropScore, shotsUntilCompress, willCompress } from "./rules";

describe("compressor cadence", () => {
  test("fires only on every sixth settled shot", () => {
    expect(willCompress(0)).toBe(false);
    expect(willCompress(5)).toBe(false);
    expect(willCompress(6)).toBe(true);
    expect(willCompress(7)).toBe(false);
    expect(willCompress(11)).toBe(false);
    expect(willCompress(12)).toBe(true);
  });

  test("counts down the pips to the next drop", () => {
    expect(shotsUntilCompress(0)).toBe(6);
    expect(shotsUntilCompress(1)).toBe(5);
    expect(shotsUntilCompress(5)).toBe(1);
    expect(shotsUntilCompress(6)).toBe(6);
    expect(shotsUntilCompress(11)).toBe(1);
  });
});

describe("dropScore", () => {
  test("doubles per bubble in one drop", () => {
    expect(dropScore(1)).toBe(20);
    expect(dropScore(2)).toBe(60);
    expect(dropScore(3)).toBe(140);
  });

  test("caps the per-bubble award", () => {
    expect(dropScore(30)).toBeLessThan(30 * 5121);
    expect(Number.isFinite(dropScore(60))).toBe(true);
  });
});
