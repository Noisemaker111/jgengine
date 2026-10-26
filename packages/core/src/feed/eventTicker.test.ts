import { describe, expect, test } from "bun:test";

import { createEventTicker } from "./eventTicker";

describe("createEventTicker", () => {
  test("push appends a stamped, id'd entry retrievable newest-first via recent", () => {
    let clock = 100;
    const ticker = createEventTicker({ now: () => clock });
    ticker.push({ kind: "kill", text: "Ranger eliminated Marauder" });
    clock = 200;
    ticker.push({ kind: "info", text: "Wave 3 cleared", icon: "flag" });

    const recent = ticker.recent();
    expect(recent.map((e) => e.text)).toEqual(["Wave 3 cleared", "Ranger eliminated Marauder"]);
    expect(recent[0]!.kind).toBe("info");
    expect(recent[0]!.icon).toBe("flag");
    expect(recent[0]!.id).toBe(2);
    expect(recent[1]!.id).toBe(1);
    expect(recent[0]!.at).toBe(200);
  });

  test("limit caps the buffer to the newest N entries", () => {
    const ticker = createEventTicker({ limit: 3, now: () => 0 });
    for (let i = 0; i < 5; i += 1) ticker.push({ kind: "kill", text: `k${i}` });

    expect(ticker.recent().map((e) => e.text)).toEqual(["k4", "k3", "k2"]);
    expect(ticker.entries()).toHaveLength(3);
  });

  test("no limit keeps every entry", () => {
    const ticker = createEventTicker({ now: () => 0 });
    for (let i = 0; i < 10; i += 1) ticker.push({ kind: "assist", text: `a${i}` });
    expect(ticker.entries()).toHaveLength(10);
  });

  test("recent computes fade as age / ttlMs, 0 fresh → 1 at expiry", () => {
    let clock = 0;
    const ticker = createEventTicker({ ttlMs: 1000, now: () => clock });
    ticker.push({ kind: "kill", text: "fresh" });
    clock = 500;
    const view = ticker.recent()[0]!;
    expect(view.fade).toBeCloseTo(0.5, 5);
  });

  test("fade is 0 when no ttlMs is configured", () => {
    let clock = 0;
    const ticker = createEventTicker({ now: () => clock });
    ticker.push({ kind: "kill", text: "x" });
    clock = 10_000;
    expect(ticker.recent()[0]!.fade).toBe(0);
  });

  test("recent prunes entries older than ttlMs", () => {
    let clock = 0;
    const ticker = createEventTicker({ ttlMs: 1000, now: () => clock });
    ticker.push({ kind: "kill", text: "old" });
    clock = 900;
    ticker.push({ kind: "kill", text: "new" });

    clock = 1500; // "old" (at=0) is now age 1500 > ttl 1000, "new" (at=900) age 600 survives.
    expect(ticker.recent().map((e) => e.text)).toEqual(["new"]);
    expect(ticker.entries()).toHaveLength(1);
  });

  test("recent accepts a nowOverride for deterministic pruning", () => {
    const ticker = createEventTicker({ ttlMs: 1000, now: () => 0 });
    ticker.push({ kind: "kill", text: "a" });
    expect(ticker.recent(2000)).toHaveLength(0);
  });

  test("clear drops everything", () => {
    const ticker = createEventTicker({ now: () => 0 });
    ticker.push({ kind: "kill", text: "a" });
    ticker.clear();
    expect(ticker.recent()).toHaveLength(0);
    expect(ticker.entries()).toHaveLength(0);
  });

  test("subscribe fires on push and clear, and unsubscribe stops it", () => {
    const ticker = createEventTicker({ now: () => 0 });
    let count = 0;
    const unsubscribe = ticker.subscribe(() => (count += 1));

    ticker.push({ kind: "kill", text: "a" });
    ticker.clear();
    expect(count).toBe(2);

    unsubscribe();
    ticker.push({ kind: "kill", text: "b" });
    expect(count).toBe(2);
  });

  test("snapshot/restore round-trips entries and re-anchors ages", () => {
    let clock = 1000;
    const source = createEventTicker({ ttlMs: 5000, now: () => clock });
    source.push({ kind: "kill", text: "a", icon: "skull" });
    clock = 2000;
    source.push({ kind: "assist", text: "b" });
    const snap = source.snapshot();

    // Restore into a ticker whose clock is 10s ahead: ages should be preserved, not reset.
    let clock2 = 12_000;
    const restored = createEventTicker({ ttlMs: 5000, now: () => clock2 });
    restored.restore(snap);

    const recent = restored.recent();
    expect(recent.map((e) => e.text)).toEqual(["b", "a"]);
    expect(recent[0]!.icon).toBeUndefined();
    expect(recent[1]!.icon).toBe("skull");
    // "a" was 1000ms old at snapshot; after re-anchor its fade tracks that same age.
    expect(recent[1]!.fade).toBeCloseTo(1000 / 5000, 5);

    // Next push continues the id sequence.
    expect(restored.push({ kind: "info", text: "c" })).toBe(3);
  });

  test("snapshot is an independent copy", () => {
    const ticker = createEventTicker({ now: () => 0 });
    ticker.push({ kind: "kill", text: "a" });
    const snap = ticker.snapshot();
    ticker.push({ kind: "kill", text: "b" });
    expect(snap.entries).toHaveLength(1);
  });
});
