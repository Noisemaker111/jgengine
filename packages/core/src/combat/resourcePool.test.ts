import { describe, expect, test } from "bun:test";
import { createResourcePool } from "@jgengine/core/combat/resourcePool";
import { createAbilityKit } from "@jgengine/core/combat/abilityKit";

describe("resource pool initial state", () => {
  test("defaults initial to max", () => {
    const pool = createResourcePool({ max: 100 });
    expect(pool.current()).toBe(100);
    expect(pool.max()).toBe(100);
  });

  test("uses provided initial value", () => {
    const pool = createResourcePool({ max: 100, initial: 40 });
    expect(pool.current()).toBe(40);
  });

  test("clamps initial above max down to max", () => {
    const pool = createResourcePool({ max: 100, initial: 500 });
    expect(pool.current()).toBe(100);
  });

  test("clamps initial below zero up to zero", () => {
    const pool = createResourcePool({ max: 100, initial: -20 });
    expect(pool.current()).toBe(0);
  });
});

describe("resource pool tick regen", () => {
  test("regens toward max over game-time", () => {
    const pool = createResourcePool({ max: 100, initial: 50, regenPerSecond: 10 });
    pool.tick(1);
    expect(pool.current()).toBe(60);
  });

  test("regen stops at max", () => {
    const pool = createResourcePool({ max: 100, initial: 95, regenPerSecond: 10 });
    pool.tick(1);
    expect(pool.current()).toBe(100);
  });

  test("ignores non-positive dt", () => {
    const pool = createResourcePool({ max: 100, initial: 50, regenPerSecond: 10 });
    pool.tick(0);
    pool.tick(-1);
    expect(pool.current()).toBe(50);
  });
});

describe("resource pool tick decay", () => {
  test("decays toward zero over game-time", () => {
    const pool = createResourcePool({ max: 100, initial: 50, decayPerSecond: 10 });
    pool.tick(1);
    expect(pool.current()).toBe(40);
  });

  test("decay stops at zero", () => {
    const pool = createResourcePool({ max: 100, initial: 5, decayPerSecond: 10 });
    pool.tick(1);
    expect(pool.current()).toBe(0);
  });
});

describe("resource pool net regen and decay", () => {
  test("applies net per-second delta of regen minus decay", () => {
    const pool = createResourcePool({ max: 100, initial: 50, regenPerSecond: 15, decayPerSecond: 5 });
    pool.tick(2);
    expect(pool.current()).toBe(70);
  });

  test("net negative delta drains toward zero", () => {
    const pool = createResourcePool({ max: 100, initial: 50, regenPerSecond: 5, decayPerSecond: 15 });
    pool.tick(2);
    expect(pool.current()).toBe(30);
  });
});

describe("resource pool spend", () => {
  test("spends when amount is within current", () => {
    const pool = createResourcePool({ max: 100, initial: 50 });
    expect(pool.spend(30)).toBe(true);
    expect(pool.current()).toBe(20);
  });

  test("fails and leaves current unchanged when amount exceeds current", () => {
    const pool = createResourcePool({ max: 100, initial: 20 });
    expect(pool.spend(21)).toBe(false);
    expect(pool.current()).toBe(20);
  });

  test("spending exactly current succeeds and empties the pool", () => {
    const pool = createResourcePool({ max: 100, initial: 20 });
    expect(pool.spend(20)).toBe(true);
    expect(pool.current()).toBe(0);
  });

  test("treats non-positive amounts as a no-op success", () => {
    const pool = createResourcePool({ max: 100, initial: 20 });
    expect(pool.spend(0)).toBe(true);
    expect(pool.spend(-5)).toBe(true);
    expect(pool.current()).toBe(20);
  });

  test("canSpend mirrors spend without mutating", () => {
    const pool = createResourcePool({ max: 100, initial: 20 });
    expect(pool.canSpend(20)).toBe(true);
    expect(pool.canSpend(21)).toBe(false);
    expect(pool.canSpend(0)).toBe(true);
    expect(pool.current()).toBe(20);
  });
});

describe("resource pool gain", () => {
  test("adds and clamps to max", () => {
    const pool = createResourcePool({ max: 100, initial: 90 });
    expect(pool.gain(30)).toBe(100);
    expect(pool.current()).toBe(100);
  });

  test("ignores negative amounts", () => {
    const pool = createResourcePool({ max: 100, initial: 50 });
    expect(pool.gain(-10)).toBe(50);
    expect(pool.current()).toBe(50);
  });

  test("returns the new current value", () => {
    const pool = createResourcePool({ max: 100, initial: 10 });
    expect(pool.gain(25)).toBe(35);
  });
});

describe("resource pool set and setMax", () => {
  test("set clamps into [0, max]", () => {
    const pool = createResourcePool({ max: 100, initial: 50 });
    pool.set(500);
    expect(pool.current()).toBe(100);
    pool.set(-10);
    expect(pool.current()).toBe(0);
    pool.set(42);
    expect(pool.current()).toBe(42);
  });

  test("setMax re-clamps current down when it shrinks below current", () => {
    const pool = createResourcePool({ max: 100, initial: 80 });
    pool.setMax(50);
    expect(pool.max()).toBe(50);
    expect(pool.current()).toBe(50);
  });

  test("setMax floors negative values at zero and empties the pool", () => {
    const pool = createResourcePool({ max: 100, initial: 80 });
    pool.setMax(-20);
    expect(pool.max()).toBe(0);
    expect(pool.current()).toBe(0);
  });

  test("setMax growing does not change current", () => {
    const pool = createResourcePool({ max: 100, initial: 40 });
    pool.setMax(200);
    expect(pool.max()).toBe(200);
    expect(pool.current()).toBe(40);
  });
});

describe("resource pool fraction and status flags", () => {
  test("fraction is current over max", () => {
    const pool = createResourcePool({ max: 50, initial: 25 });
    expect(pool.fraction()).toBe(0.5);
  });

  test("fraction is zero when max is zero", () => {
    const pool = createResourcePool({ max: 0 });
    expect(pool.fraction()).toBe(0);
  });

  test("isFull and isEmpty reflect boundary state", () => {
    const pool = createResourcePool({ max: 100, initial: 100 });
    expect(pool.isFull()).toBe(true);
    expect(pool.isEmpty()).toBe(false);
    pool.spend(100);
    expect(pool.isFull()).toBe(false);
    expect(pool.isEmpty()).toBe(true);
  });
});

describe("resource pool driving an ability kit", () => {
  test("cast succeeds when the pool covers resourceCost, spends on success, and regen refills over time", () => {
    const pool = createResourcePool({ max: 100, initial: 30, regenPerSecond: 10 });
    const kit = createAbilityKit([{ id: "fireball", cooldownMs: 1000, resourceCost: 25 }]);

    const first = kit.cast("fireball", pool.current());
    expect(first.ok).toBe(true);
    expect(pool.spend(25)).toBe(true);
    expect(pool.current()).toBe(5);

    kit.tick(1);
    const second = kit.cast("fireball", pool.current());
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("no-resource");

    pool.tick(3);
    expect(pool.current()).toBe(35);
    kit.tick(1);
    const third = kit.cast("fireball", pool.current());
    expect(third.ok).toBe(true);
    expect(pool.spend(25)).toBe(true);
    expect(pool.current()).toBe(10);
  });
});
