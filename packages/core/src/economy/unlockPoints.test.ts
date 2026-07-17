import { describe, expect, test } from "bun:test";

import { createUnlockPoints } from "./unlockPoints";

describe("createUnlockPoints", () => {
  test("starts empty by default", () => {
    const points = createUnlockPoints();
    expect(points.earned()).toBe(0);
    expect(points.spent()).toBe(0);
    expect(points.available()).toBe(0);
    expect(points.unlockedIds()).toEqual([]);
  });

  test("start config banks initial points", () => {
    const points = createUnlockPoints({ start: 5 });
    expect(points.available()).toBe(5);
    expect(points.earned()).toBe(5);
  });

  test("grantForLevel uses the default one-point-per-level curve", () => {
    const points = createUnlockPoints();
    expect(points.grantForLevel(3)).toBe(1);
    expect(points.grantForLevel(4)).toBe(1);
    expect(points.available()).toBe(2);
  });

  test("grantForLevel honors a non-uniform curve", () => {
    const points = createUnlockPoints({ perLevel: { kind: "linear", base: 0, per: 2 } });
    expect(points.grantForLevel(1)).toBe(2);
    expect(points.grantForLevel(5)).toBe(10);
    expect(points.available()).toBe(12);
  });

  test("grantOnLevelUp accumulates across every gained level", () => {
    const points = createUnlockPoints({ perLevel: { kind: "linear", base: 0, per: 1 } });
    // levels 2 + 3 + 4 granted when moving from level 1 to 4
    const granted = points.grantOnLevelUp(1, 4);
    expect(granted).toBe(2 + 3 + 4);
    expect(points.available()).toBe(9);
  });

  test("grantOnLevelUp grants nothing when no level was gained", () => {
    const points = createUnlockPoints({ start: 3 });
    expect(points.grantOnLevelUp(5, 5)).toBe(0);
    expect(points.grantOnLevelUp(5, 4)).toBe(0);
    expect(points.available()).toBe(3);
  });

  test("direct grant ignores non-positive and non-finite amounts", () => {
    const points = createUnlockPoints();
    points.grant(4);
    points.grant(-2);
    points.grant(Number.NaN);
    points.grant(Number.POSITIVE_INFINITY);
    expect(points.available()).toBe(4);
  });

  test("spend deducts and records the unlock", () => {
    const points = createUnlockPoints({ start: 10 });
    const result = points.spend("engram.dash", 3);
    expect(result).toEqual({ ok: true, available: 7 });
    expect(points.spent()).toBe(3);
    expect(points.available()).toBe(7);
    expect(points.isUnlocked("engram.dash")).toBe(true);
    expect(points.costOf("engram.dash")).toBe(3);
    expect(points.unlockedIds()).toEqual(["engram.dash"]);
  });

  test("canAfford tracks the exact boundary", () => {
    const points = createUnlockPoints({ start: 3 });
    expect(points.canAfford(3)).toBe(true);
    expect(points.canAfford(4)).toBe(false);
    points.spend("a", 3);
    expect(points.canAfford(1)).toBe(false);
    expect(points.canAfford(0)).toBe(true);
  });

  test("spend rejects insufficient points without mutating state", () => {
    const points = createUnlockPoints({ start: 2 });
    const result = points.spend("expensive", 5);
    expect(result).toEqual({ ok: false, reason: "insufficient-points" });
    expect(points.available()).toBe(2);
    expect(points.isUnlocked("expensive")).toBe(false);
  });

  test("spend rejects a repeat unlock", () => {
    const points = createUnlockPoints({ start: 10 });
    points.spend("node", 2);
    const result = points.spend("node", 2);
    expect(result).toEqual({ ok: false, reason: "already-unlocked" });
    expect(points.spent()).toBe(2);
  });

  test("spend rejects invalid costs", () => {
    const points = createUnlockPoints({ start: 10 });
    expect(points.spend("a", -1)).toEqual({ ok: false, reason: "invalid-cost" });
    expect(points.spend("b", Number.NaN)).toEqual({ ok: false, reason: "invalid-cost" });
    expect(points.unlockedIds()).toEqual([]);
  });

  test("zero-cost unlocks are allowed and recorded", () => {
    const points = createUnlockPoints();
    expect(points.spend("free", 0)).toEqual({ ok: true, available: 0 });
    expect(points.isUnlocked("free")).toBe(true);
  });

  test("injected prerequisite predicate gates spending", () => {
    const points = createUnlockPoints({ start: 10 });
    const owned = new Set<string>();
    const requires = (id: string) => () => owned.has(id);

    const blocked = points.spend("tier2", 3, { requires: requires("tier1") });
    expect(blocked).toEqual({ ok: false, reason: "missing-prerequisites" });
    expect(points.available()).toBe(10);

    owned.add("tier1");
    const allowed = points.spend("tier2", 3, { requires: requires("tier1") });
    expect(allowed.ok).toBe(true);
    expect(points.isUnlocked("tier2")).toBe(true);
  });

  test("prerequisite is checked before affordability (no points burned on a gated node)", () => {
    const points = createUnlockPoints({ start: 1 });
    const result = points.spend("gated", 5, { requires: () => false });
    expect(result).toEqual({ ok: false, reason: "missing-prerequisites" });
    expect(points.available()).toBe(1);
  });

  test("refund returns a single unlock's cost", () => {
    const points = createUnlockPoints({ start: 10 });
    points.spend("a", 3);
    points.spend("b", 4);
    expect(points.refund("a")).toBe(true);
    expect(points.available()).toBe(10 - 4);
    expect(points.isUnlocked("a")).toBe(false);
    expect(points.isUnlocked("b")).toBe(true);
    // refunding an id that was never unlocked is a no-op
    expect(points.refund("missing")).toBe(false);
  });

  test("respec fully refunds and clears unlocks while keeping earned", () => {
    const points = createUnlockPoints({ start: 10 });
    points.spend("a", 3);
    points.spend("b", 4);
    expect(points.spent()).toBe(7);

    const refunded = points.respec();
    expect(refunded).toBe(7);
    expect(points.available()).toBe(10);
    expect(points.earned()).toBe(10);
    expect(points.spent()).toBe(0);
    expect(points.unlockedIds()).toEqual([]);
  });

  test("snapshot/hydrate round-trips through JSON", () => {
    const points = createUnlockPoints({ start: 12 });
    points.spend("a", 2);
    points.spend("b", 5);

    const restored = createUnlockPoints({ state: JSON.parse(JSON.stringify(points.snapshot())) });
    expect(restored.earned()).toBe(12);
    expect(restored.spent()).toBe(7);
    expect(restored.available()).toBe(5);
    expect(restored.unlockedIds().sort()).toEqual(["a", "b"]);
    expect(restored.costOf("b")).toBe(5);
  });

  test("hydrate replaces existing state and discards invalid entries", () => {
    const points = createUnlockPoints({ start: 99 });
    points.spend("stale", 10);
    points.hydrate({ earned: 8, unlocked: { keep: 3, bad: Number.NaN } });
    expect(points.earned()).toBe(8);
    expect(points.costOf("keep")).toBe(3);
    expect(points.costOf("bad")).toBe(0);
    expect(points.isUnlocked("stale")).toBe(false);
    expect(points.available()).toBe(8 - 3);
  });
});
