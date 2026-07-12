import { describe, expect, test } from "bun:test";

import { createDotField } from "@jgengine/core/combat/dotField";

describe("createDotField", () => {
  test("emits one damage tick per interval crossed", () => {
    const dots = createDotField();
    dots.apply("bleed", { damagePerTick: 5, intervalMs: 100, durationMs: 500, status: "bleed" });
    expect(dots.tick(0.05)).toEqual([]);
    const first = dots.tick(0.05);
    expect(first).toEqual([{ id: "bleed", status: "bleed", damage: 5, expired: false }]);
  });

  test("a large dt is capped to the DoT lifetime, not the elapsed time", () => {
    const dots = createDotField();
    dots.apply("burn", { damagePerTick: 3, intervalMs: 100, durationMs: 300 });
    const ticks = dots.tick(1);
    expect(ticks.filter((t) => t.damage > 0)).toHaveLength(3);
    expect(ticks.at(-1)?.expired).toBe(true);
    expect(dots.active("burn")).toBe(false);
  });

  test("status defaults to the apply key", () => {
    const dots = createDotField();
    dots.apply("poison", { damagePerTick: 2, intervalMs: 100, durationMs: 100 });
    expect(dots.tick(0.1)[0]?.status).toBe("poison");
  });

  test("reapplying refreshes duration", () => {
    const dots = createDotField();
    dots.apply("bleed", { damagePerTick: 1, intervalMs: 100, durationMs: 150 });
    dots.tick(0.1);
    dots.apply("bleed", { damagePerTick: 1, intervalMs: 100, durationMs: 150 });
    dots.tick(0.1);
    expect(dots.active("bleed")).toBe(true);
  });

  test("expiry with no pending damage still emits a marker", () => {
    const dots = createDotField();
    dots.apply("stun", { damagePerTick: 0, intervalMs: 100, durationMs: 40 });
    const ticks = dots.tick(0.05);
    expect(ticks).toEqual([{ id: "stun", status: "stun", damage: 0, expired: true }]);
  });

  test("applyProc bridges a buildup proc into recurring damage", () => {
    const dots = createDotField();
    dots.applyProc("rot", { status: "rot", durationMs: 200 }, 4, 100);
    const ticks = dots.tick(0.2);
    expect(ticks.filter((t) => t.damage > 0)).toHaveLength(2);
    expect(ticks[0]?.status).toBe("rot");
  });

  test("cancel and clear remove active DoTs", () => {
    const dots = createDotField();
    dots.apply("a", { damagePerTick: 1, intervalMs: 100, durationMs: 1000 });
    dots.apply("b", { damagePerTick: 1, intervalMs: 100, durationMs: 1000 });
    dots.cancel("a");
    expect(dots.count()).toBe(1);
    dots.clear();
    expect(dots.count()).toBe(0);
  });
});
