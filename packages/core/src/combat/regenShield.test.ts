import { describe, expect, test } from "bun:test";

import { createRegenShield, type RegenShieldPool } from "@jgengine/core/combat/regenShield";

describe("createRegenShield", () => {
  test("starts full and reports fraction", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 20, regenDelayMs: 1000 });
    expect(shield.current()).toBe(100);
    expect(shield.fraction()).toBe(1);
    expect(shield.isFull()).toBe(true);
  });

  test("damage absorbs and returns overflow past the pool", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 20, regenDelayMs: 1000 });
    expect(shield.damage(30)).toBe(0);
    expect(shield.current()).toBe(70);
    expect(shield.damage(120)).toBe(50);
    expect(shield.current()).toBe(0);
    expect(shield.isBroken()).toBe(true);
  });

  test("regen is suppressed until the grace period elapses, then refills", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 50, regenDelayMs: 1000 });
    shield.damage(60);
    expect(shield.suppressed()).toBe(true);
    shield.tick(0.5);
    expect(shield.current()).toBe(40);
    shield.tick(0.4);
    expect(shield.current()).toBe(40);
    expect(shield.suppressed()).toBe(true);
    shield.tick(0.2);
    expect(shield.current()).toBeCloseTo(50);
    expect(shield.suppressed()).toBe(false);
    shield.tick(1);
    expect(shield.current()).toBe(100);
  });

  test("each hit restarts the grace period", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 50, regenDelayMs: 1000 });
    shield.damage(50);
    shield.tick(0.9);
    shield.damage(10);
    shield.tick(0.9);
    expect(shield.current()).toBe(40);
    expect(shield.suppressed()).toBe(true);
  });

  test("restore ignores the grace timer and clamps to max", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 10, regenDelayMs: 1000 });
    shield.damage(80);
    shield.restore(200);
    expect(shield.current()).toBe(100);
    expect(shield.suppressed()).toBe(true);
  });

  test("refill adds points without clearing suppression", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 10, regenDelayMs: 1000 });
    shield.damage(80);
    shield.refill(30);
    expect(shield.current()).toBe(50);
    expect(shield.suppressed()).toBe(true);
  });

  test("JSON restore resumes resized bounds, grace timing, and a live delay override", () => {
    const config = { max: 100, regenPerSecond: 20, regenDelayMs: 1000 };
    const original = createRegenShield(config);
    original.setMax(150);
    original.damage(40);
    original.tick(0.4, { regenDelayMs: 2000 });
    const saved = original.state();
    const resumed = createRegenShield(config);
    expect(resumed.restore(JSON.parse(JSON.stringify(saved)))).toBe(true);
    expect(resumed.state()).toEqual(original.state());
    expect(resumed.max()).toBe(150);
    expect(resumed.suppressed()).toBe(true);
    saved.current = 999;
    for (const dt of [0.4, 0.4, 0.4, 0.5]) {
      original.tick(dt, { regenDelayMs: 2000 });
      resumed.tick(dt, { regenDelayMs: 2000 });
      expect(resumed.state()).toEqual(original.state());
    }
    expect(resumed.suppressed()).toBe(false);
    expect(resumed.current()).toBe(70);
  });
});

describe("pool-backed shields", () => {
  function statPool(initial: number, max: number): { pool: RegenShieldPool; value: () => number; hit: (n: number) => void } {
    let value = initial;
    return {
      pool: { current: () => value, max: () => max, set: (next) => { value = next; } },
      value: () => value,
      hit: (n) => { value = Math.max(0, value - n); },
    };
  }

  test("reads and writes the external store rather than a private copy", () => {
    const stat = statPool(100, 100);
    const shield = createRegenShield({ max: 0, regenPerSecond: 10, regenDelayMs: 1000, pool: stat.pool });
    expect(shield.current()).toBe(100);
    expect(shield.max()).toBe(100);
    shield.damage(30);
    // The store moved, not an internal field.
    expect(stat.value()).toBe(70);
    expect(shield.current()).toBe(70);
  });

  test("damage applied externally suppresses regen on the very next tick", () => {
    const stat = statPool(100, 100);
    const shield = createRegenShield({ max: 0, regenPerSecond: 50, regenDelayMs: 1000, pool: stat.pool });
    // Warm up past the grace period so regen is live.
    shield.tick(2);
    expect(shield.suppressed()).toBe(false);

    // A hit routed through the game's own pipeline, never through `damage()`.
    stat.hit(40);
    shield.tick(0.1);
    expect(shield.suppressed()).toBe(true);
    // Crucially it did NOT regen over the top of the hit.
    expect(stat.value()).toBe(60);
  });

  test("regen resumes only after the grace period, then refills toward the pool max", () => {
    const stat = statPool(100, 100);
    const shield = createRegenShield({ max: 0, regenPerSecond: 50, regenDelayMs: 1000, pool: stat.pool });
    stat.hit(60);
    // The tick that observes the hit restarts the grace period, so the clock starts here.
    shield.tick(0.5);
    expect(stat.value()).toBe(40);
    shield.tick(0.6);
    expect(stat.value()).toBe(40); // 600ms of a 1000ms grace period
    shield.tick(0.6); // grace elapsed
    expect(stat.value()).toBeGreaterThan(40);
    for (let i = 0; i < 60; i += 1) shield.tick(0.1);
    expect(stat.value()).toBe(100);
    expect(shield.isFull()).toBe(true);
  });

  test("the shield's own regen writes are not mistaken for damage", () => {
    const stat = statPool(10, 100);
    const shield = createRegenShield({ max: 0, regenPerSecond: 20, regenDelayMs: 0, pool: stat.pool });
    for (let i = 0; i < 10; i += 1) {
      shield.tick(0.1);
      expect(shield.suppressed()).toBe(false);
    }
    expect(stat.value()).toBeGreaterThan(10);
  });

  test("a cold start is not read as a hit", () => {
    const stat = statPool(50, 100);
    const shield = createRegenShield({ max: 0, regenPerSecond: 10, regenDelayMs: 500, pool: stat.pool });
    // First observation must not trip the grace timer; regen is available immediately.
    shield.tick(0.1);
    expect(shield.suppressed()).toBe(false);
    expect(stat.value()).toBeGreaterThan(50);
  });

  test("noteDamage restarts the grace period without moving the value", () => {
    const stat = statPool(80, 100);
    const shield = createRegenShield({ max: 0, regenPerSecond: 10, regenDelayMs: 1000, pool: stat.pool });
    shield.tick(2);
    const before = stat.value();
    shield.noteDamage();
    expect(shield.suppressed()).toBe(true);
    expect(stat.value()).toBe(before);
  });

  test("setMax is refused on a pool-backed shield — the store owns its bounds", () => {
    const stat = statPool(50, 100);
    const shield = createRegenShield({ max: 0, regenPerSecond: 10, regenDelayMs: 0, pool: stat.pool });
    shield.setMax(20);
    expect(shield.max()).toBe(100);
    expect(shield.current()).toBe(50);
  });

  test("restore adds without touching the grace period", () => {
    const stat = statPool(20, 100);
    const shield = createRegenShield({ max: 0, regenPerSecond: 10, regenDelayMs: 1000, pool: stat.pool });
    stat.hit(5);
    shield.tick(0.1);
    expect(shield.suppressed()).toBe(true);
    shield.restore(30);
    expect(stat.value()).toBe(45);
    expect(shield.suppressed()).toBe(true);
  });

  test("JSON restore writes the pool and retains a pending external hit for the next tick", () => {
    const first = statPool(100, 100);
    const second = statPool(10, 100);
    const config = { max: 0, regenPerSecond: 50, regenDelayMs: 1000 };
    const original = createRegenShield({ ...config, pool: first.pool });
    first.hit(40);
    const saved = original.state();
    const resumed = createRegenShield({ ...config, pool: second.pool });
    expect(resumed.restore(JSON.parse(JSON.stringify(saved)))).toBe(true);
    expect(second.value()).toBe(60);
    expect(resumed.state()).toEqual(original.state());
    for (const dt of [0.2, 0.5, 0.6]) {
      original.tick(dt);
      resumed.tick(dt);
      expect(resumed.state()).toEqual(original.state());
      expect(second.value()).toBe(first.value());
    }
    expect(second.value()).toBe(90);
  });

  test("rejects incompatible pool bounds without moving the pool or timer", () => {
    const stat = statPool(50, 100);
    const shield = createRegenShield({ max: 0, regenPerSecond: 10, regenDelayMs: 1000, pool: stat.pool });
    shield.damage(10);
    const before = shield.state();
    expect(shield.restore({ ...before, max: 200, current: 5, sinceDamageMs: 999 })).toBe(false);
    expect(shield.state()).toEqual(before);
    expect(stat.value()).toBe(40);
  });
});
