import { describe, expect, test } from "bun:test";

import { createRegenShield } from "@jgengine/core/combat/regenShield";

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
});
