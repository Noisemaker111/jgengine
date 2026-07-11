import { describe, expect, test } from "bun:test";

import { sequencePads } from "./sequence";

describe("sequencePads", () => {
  test("the same seed always produces the identical sequence", () => {
    expect(sequencePads("determinism", 20)).toEqual(sequencePads("determinism", 20));
  });

  test("a longer draw from the same seed preserves the shorter prefix", () => {
    const five = sequencePads("prefix", 5);
    const thirteen = sequencePads("prefix", 13);
    expect(thirteen.slice(0, 5)).toEqual(five);
  });

  test("every pad index stays within 0..3", () => {
    for (const pad of sequencePads("range", 200)) {
      expect(pad).toBeGreaterThanOrEqual(0);
      expect(pad).toBeLessThanOrEqual(3);
    }
  });

  test("different seeds diverge", () => {
    const a = sequencePads("seed-one", 24).join(",");
    const b = sequencePads("seed-two", 24).join(",");
    expect(a).not.toBe(b);
  });

  test("a long run uses all four pads", () => {
    const seen = new Set(sequencePads("coverage", 100));
    expect(seen.size).toBe(4);
  });
});
