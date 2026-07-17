import { describe, expect, test } from "bun:test";

import { createGameEvents } from "./events";
import { appendFeed, createGameFeed, pruneFeed } from "./feed";

interface Notice {
  id: number;
  text: string;
  tone: "info" | "good";
  at: number;
}

describe("gameFeed", () => {
  test("push appends an entry retrievable via recent", () => {
    const feed = createGameFeed();
    feed.push("loot.granted", { userId: "alice", item: "gem" });

    const recent = feed.recent("loot.granted");
    expect(recent).toHaveLength(1);
    expect(recent[0].data).toEqual({ userId: "alice", item: "gem" });
  });

  test("recent limits to the most recent N entries in order", () => {
    const feed = createGameFeed();
    feed.push("chat", "a");
    feed.push("chat", "b");
    feed.push("chat", "c");

    expect(feed.recent("chat", { limit: 2 }).map((entry) => entry.data)).toEqual(["b", "c"]);
  });

  test("ring buffer default limit is 20 entries per action", () => {
    const feed = createGameFeed();
    for (let i = 0; i < 25; i++) feed.push("chat", i);

    const recent = feed.recent("chat");
    expect(recent).toHaveLength(20);
    expect(recent[0].data).toBe(5);
    expect(recent[19].data).toBe(24);
  });

  test("options.limit overrides the default ring buffer size", () => {
    const feed = createGameFeed({ limit: 3 });
    for (let i = 0; i < 5; i++) feed.push("chat", i);

    const recent = feed.recent("chat");
    expect(recent).toHaveLength(3);
    expect(recent.map((entry) => entry.data)).toEqual([2, 3, 4]);
  });

  test("bind pipes matching game events into the buffer", () => {
    const events = createGameEvents();
    const feed = createGameFeed();
    feed.bind("entity.died", events);

    events.emit("entity.died", {
      instanceId: "e1",
      catalogId: "goblin",
      reason: { kind: "self", source: "out_of_bounds" },
      position: [0, 0, 0],
    });

    expect(feed.recent("entity.died")).toHaveLength(1);
  });

  test("bind returns an unsubscribe function", () => {
    const events = createGameEvents();
    const feed = createGameFeed();
    const unsubscribe = feed.bind("entity.died", events);

    unsubscribe();
    events.emit("entity.died", {
      instanceId: "e1",
      catalogId: "goblin",
      reason: { kind: "self", source: "out_of_bounds" },
      position: [0, 0, 0],
    });

    expect(feed.recent("entity.died")).toHaveLength(0);
  });

  test("subscribe notifies listeners of newly pushed entries", () => {
    const feed = createGameFeed();
    const received: unknown[] = [];
    feed.subscribe("chat", (entry) => received.push(entry.data));

    feed.push("chat", "hello");

    expect(received).toEqual(["hello"]);
  });

  test("snapshot and hydrate round-trip buffer contents", () => {
    const feed = createGameFeed();
    feed.push("chat", "hello");
    const snapshot = feed.snapshot();

    const restored = createGameFeed();
    restored.hydrate(snapshot);

    expect(restored.recent("chat").map((entry) => entry.data)).toEqual(["hello"]);
  });
});

describe("appendFeed / pruneFeed on flat serializable entries", () => {
  const notice = (id: number, at: number, tone: Notice["tone"] = "info"): Notice => ({
    id,
    text: `n${id}`,
    tone,
    at,
  });

  test("count-cap keeps the newest limit entries (loopline-style toasts)", () => {
    let toasts: Notice[] = [];
    for (let i = 1; i <= 8; i += 1) toasts = appendFeed(toasts, notice(i, i), { limit: 6 });
    expect(toasts.map((t) => t.id)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  test("ttl drops entries older than the window at append time (starhome-style events)", () => {
    let events: Notice[] = [notice(1, 0), notice(2, 4)];
    events = appendFeed(events, notice(3, 10), { limit: 6, ttl: 7 });
    // cutoff = 10 - 7 = 3; keep at > 3, so at=0 is evicted and at=4 survives (matches `now - at < ttl`).
    expect(events.map((e) => e.id)).toEqual([2, 3]);
  });

  test("no options appends without bounding, preserving the flat shape", () => {
    const events = appendFeed([notice(1, 0)], notice(2, 1));
    expect(events).toEqual([notice(1, 0), notice(2, 1)]);
  });

  test("appendFeed returns a new array and never mutates the input", () => {
    const start: Notice[] = [notice(1, 0)];
    const next = appendFeed(start, notice(2, 1), { limit: 6 });
    expect(next).not.toBe(start);
    expect(start).toHaveLength(1);
  });

  test("pruneFeed evicts by age and preserves identity when nothing expired", () => {
    const events: Notice[] = [notice(1, 0), notice(2, 5), notice(3, 9)];
    expect(pruneFeed(events, 10, 7).map((e) => e.id)).toEqual([2, 3]);
    expect(pruneFeed(events, 3, 100)).toBe(events);
  });

  test("a bounded feed round-trips through JSON", () => {
    let events: Notice[] = [];
    for (let i = 1; i <= 4; i += 1) events = appendFeed(events, notice(i, i), { limit: 6 });
    const restored = JSON.parse(JSON.stringify(events)) as Notice[];
    expect(restored).toEqual(events);
    expect(appendFeed(restored, notice(5, 5), { limit: 6 })).toEqual(
      appendFeed(events, notice(5, 5), { limit: 6 }),
    );
  });
});
