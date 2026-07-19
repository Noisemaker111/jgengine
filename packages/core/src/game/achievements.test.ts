import { describe, expect, test } from "bun:test";

import { createAchievementTracker, type AchievementDef, type AchievementUnlock } from "./achievements";

const DEFS: readonly AchievementDef[] = [
  { id: "first-blood", name: "First Blood", points: 10 },
  { id: "centurion", name: "Centurion", description: "Defeat 100 foes", target: 100, points: 50 },
  { id: "secret-ending", name: "True Ending", secret: true, points: 100 },
];

function tracker(onUnlock?: (u: AchievementUnlock) => void) {
  let clock = 1000;
  return createAchievementTracker({ defs: DEFS, now: () => (clock += 1), onUnlock });
}

describe("createAchievementTracker", () => {
  test("boolean unlock fires onUnlock once and is idempotent", () => {
    const unlocks: AchievementUnlock[] = [];
    const t = tracker((u) => unlocks.push(u));
    const first = t.unlock("first-blood");
    expect(first?.id).toBe("first-blood");
    expect(t.isUnlocked("first-blood")).toBe(true);
    expect(t.unlock("first-blood")).toBeNull(); // already unlocked
    expect(unlocks).toHaveLength(1);
  });

  test("unlocking an unknown id is a no-op", () => {
    const t = tracker();
    expect(t.unlock("nope")).toBeNull();
  });

  test("counter progress accumulates and unlocks exactly on reaching target", () => {
    const unlocks: AchievementUnlock[] = [];
    const t = tracker((u) => unlocks.push(u));
    expect(t.progress("centurion", 60)).toBeNull();
    expect(t.get("centurion")?.fraction).toBeCloseTo(0.6, 5);
    const crossed = t.progress("centurion", 40);
    expect(crossed?.id).toBe("centurion");
    expect(t.isUnlocked("centurion")).toBe(true);
    expect(t.get("centurion")?.progress).toBe(100);
    // further progress after unlock is inert
    expect(t.progress("centurion", 25)).toBeNull();
    expect(t.get("centurion")?.progress).toBe(100);
    expect(unlocks).toHaveLength(1);
  });

  test("setProgress clamps to [0, target] and progress on a boolean achievement is a no-op", () => {
    const t = tracker();
    expect(t.setProgress("centurion", 999)?.id).toBe("centurion"); // clamps to 100 and unlocks
    expect(t.get("centurion")?.progress).toBe(100);
    expect(t.progress("first-blood", 5)).toBeNull(); // no target → not a counter
    expect(t.get("first-blood")?.progress).toBe(0);
  });

  test("score sums unlocked points; completion is the unlocked fraction", () => {
    const t = tracker();
    expect(t.completion()).toBe(0);
    t.unlock("first-blood");
    t.setProgress("centurion", 100);
    expect(t.score()).toBe(60);
    expect(t.completion()).toBeCloseTo(2 / 3, 5);
  });

  test("list keeps a stable identity until state changes (useSyncExternalStore contract)", () => {
    const t = tracker();
    const a = t.list();
    expect(t.list()).toBe(a); // same identity, no mutation between reads
    t.unlock("first-blood");
    expect(t.list()).not.toBe(a); // invalidated on change
  });

  test("snapshot/restore round-trips unlocks and counters", () => {
    const t = tracker();
    t.unlock("first-blood");
    t.progress("centurion", 40);
    const snap = JSON.parse(JSON.stringify(t.snapshot()));

    const t2 = tracker();
    t2.restore(snap);
    expect(t2.isUnlocked("first-blood")).toBe(true);
    expect(t2.get("centurion")?.progress).toBe(40);
    expect(t2.isUnlocked("centurion")).toBe(false);
    expect(t2.score()).toBe(10);
  });

  test("restore ignores ids not in the current definition set", () => {
    const t = tracker();
    t.restore({ unlocked: { ghost: 5 }, counters: { phantom: 3 } });
    expect(t.list().every((v) => !v.unlocked)).toBe(true);
    expect(t.completion()).toBe(0);
  });

  test("subscribe fires on each state change and stops after unsubscribe", () => {
    const t = tracker();
    let hits = 0;
    const off = t.subscribe(() => { hits += 1; });
    t.progress("centurion", 10);
    t.unlock("first-blood");
    off();
    t.unlock("secret-ending");
    expect(hits).toBe(2);
  });
});
