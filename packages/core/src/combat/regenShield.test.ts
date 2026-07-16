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

  test("setRegenPerSecond changes the refill rate at runtime", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 10, regenDelayMs: 0 });
    shield.damage(50);
    shield.setRegenPerSecond(40);
    shield.tick(1);
    expect(shield.current()).toBe(90);
  });

  test("setRegenDelayMs changes the grace window at runtime", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 10, regenDelayMs: 5000 });
    shield.damage(50);
    shield.setRegenDelayMs(1000);
    shield.tick(0.9);
    expect(shield.current()).toBe(50);
    shield.tick(0.2);
    expect(shield.current()).toBeCloseTo(52);
    expect(shield.suppressed()).toBe(false);
  });

  test("poke restarts the grace period without subtracting from the pool", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 50, regenDelayMs: 1000 });
    shield.tick(2);
    expect(shield.suppressed()).toBe(false);
    shield.poke();
    expect(shield.suppressed()).toBe(true);
    expect(shield.current()).toBe(100);
    shield.set(40);
    shield.poke();
    shield.tick(0.5);
    expect(shield.current()).toBe(40);
    shield.tick(0.6);
    expect(shield.current()).toBeCloseTo(70);
  });

  test("observeValue mirrors an external pool and treats a decrease as a hit", () => {
    const shield = createRegenShield({ max: 100, regenPerSecond: 50, regenDelayMs: 1000 });
    expect(shield.observeValue(70)).toBe(true);
    expect(shield.current()).toBe(70);
    expect(shield.suppressed()).toBe(true);
    shield.tick(0.9);
    expect(shield.current()).toBe(70);
    shield.tick(0.4);
    expect(shield.current()).toBeCloseTo(90);
    expect(shield.observeValue(95)).toBe(false);
    expect(shield.current()).toBe(95);
    expect(shield.suppressed()).toBe(false);
  });
});
