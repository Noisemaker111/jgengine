import { describe, expect, test } from "bun:test";
import { createComboPoints } from "@jgengine/core/combat/comboPoints";

describe("combo points accrual", () => {
  test("default gain adds 1", () => {
    const combo = createComboPoints({ max: 5 });
    combo.gain();
    expect(combo.points()).toBe(1);
    combo.gain();
    expect(combo.points()).toBe(2);
  });

  test("gain adds a given amount", () => {
    const combo = createComboPoints({ max: 5 });
    combo.gain(3);
    expect(combo.points()).toBe(3);
  });

  test("clamps at max", () => {
    const combo = createComboPoints({ max: 5 });
    combo.gain(3);
    combo.gain(4);
    expect(combo.points()).toBe(5);
  });

  test("ignores non-positive gain amounts and does not reset the timer", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 10 });
    combo.gain(2);
    combo.tick(4);
    expect(combo.expiresIn()).toBe(6);
    expect(combo.gain(0)).toBe(2);
    expect(combo.gain(-1)).toBe(2);
    expect(combo.points()).toBe(2);
    expect(combo.expiresIn()).toBe(6);
  });
});

describe("combo points expiry", () => {
  test("expires all points after the timeout", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 10 });
    combo.gain(3);
    combo.tick(9);
    expect(combo.points()).toBe(3);
    combo.tick(1);
    expect(combo.points()).toBe(0);
    expect(combo.expiresIn()).toBeNull();
  });

  test("expiry timer resets on each gain, based on the last gain", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 10 });
    combo.gain(1);
    combo.tick(8);
    combo.gain(1);
    expect(combo.points()).toBe(2);
    combo.tick(8);
    expect(combo.points()).toBe(2);
    expect(combo.expiresIn()).toBe(2);
    combo.tick(2);
    expect(combo.points()).toBe(0);
  });

  test("never expires when expireAfterSeconds is undefined", () => {
    const combo = createComboPoints({ max: 5 });
    combo.gain(3);
    combo.tick(1000);
    expect(combo.points()).toBe(3);
    expect(combo.expiresIn()).toBeNull();
  });

  test("ignores non-positive dt", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 5 });
    combo.gain(2);
    combo.tick(0);
    combo.tick(-3);
    expect(combo.points()).toBe(2);
    expect(combo.expiresIn()).toBe(5);
  });
});

describe("combo points spending", () => {
  test("spend deducts and returns true when affordable", () => {
    const combo = createComboPoints({ max: 5 });
    combo.gain(4);
    expect(combo.spend(3)).toBe(true);
    expect(combo.points()).toBe(1);
  });

  test("spend fails and leaves points untouched when unaffordable", () => {
    const combo = createComboPoints({ max: 5 });
    combo.gain(2);
    expect(combo.spend(3)).toBe(false);
    expect(combo.points()).toBe(2);
  });

  test("spending non-positive amounts is a no-op success", () => {
    const combo = createComboPoints({ max: 5 });
    combo.gain(2);
    expect(combo.spend(0)).toBe(true);
    expect(combo.spend(-1)).toBe(true);
    expect(combo.points()).toBe(2);
  });

  test("partial spend keeps the expiry timer running", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 10 });
    combo.gain(4);
    combo.tick(4);
    combo.spend(2);
    expect(combo.points()).toBe(2);
    expect(combo.expiresIn()).toBe(6);
    combo.tick(6);
    expect(combo.points()).toBe(0);
  });

  test("spending down to zero clears the expiry timer", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 10 });
    combo.gain(3);
    combo.spend(3);
    expect(combo.points()).toBe(0);
    expect(combo.expiresIn()).toBeNull();
    combo.tick(100);
    expect(combo.points()).toBe(0);
  });

  test("spendAll spends everything and clears the timer", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 10 });
    combo.gain(4);
    expect(combo.spendAll()).toBe(4);
    expect(combo.points()).toBe(0);
    expect(combo.expiresIn()).toBeNull();
  });

  test("spendAll on an empty pool returns 0", () => {
    const combo = createComboPoints({ max: 5 });
    expect(combo.spendAll()).toBe(0);
  });
});

describe("combo points expiresIn progression", () => {
  test("counts down across multiple ticks", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 6 });
    combo.gain(1);
    expect(combo.expiresIn()).toBe(6);
    combo.tick(2);
    expect(combo.expiresIn()).toBe(4);
    combo.tick(1.5);
    expect(combo.expiresIn()).toBe(2.5);
    combo.tick(2.5);
    expect(combo.expiresIn()).toBeNull();
  });

  test("is null when there are no points", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 6 });
    expect(combo.expiresIn()).toBeNull();
  });
});

describe("combo points clear", () => {
  test("clear resets points and the expiry timer", () => {
    const combo = createComboPoints({ max: 5, expireAfterSeconds: 10 });
    combo.gain(4);
    combo.tick(3);
    combo.clear();
    expect(combo.points()).toBe(0);
    expect(combo.expiresIn()).toBeNull();
    combo.tick(100);
    expect(combo.points()).toBe(0);
  });
});
