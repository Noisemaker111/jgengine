import { describe, expect, test } from "bun:test";

import { createGameEvents } from "./events";
import { createGameFeed } from "./feed";

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
