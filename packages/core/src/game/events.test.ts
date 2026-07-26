import { describe, expect, test } from "bun:test";

import { createGameEvents, lootDropsOf, type LootGrantedEvent } from "./events";

describe("gameEvents", () => {
  test("on registers a handler that receives emitted payloads", () => {
    const events = createGameEvents();
    const received: unknown[] = [];
    events.on("stat.levelUp", (payload) => received.push(payload));

    events.emit("stat.levelUp", { userId: "alice", stat: "mining", level: 5 });

    expect(received).toEqual([{ userId: "alice", stat: "mining", level: 5 }]);
  });

  test("unsubscribe stops further delivery", () => {
    const events = createGameEvents();
    const received: unknown[] = [];
    const unsubscribe = events.on("stat.levelUp", (payload) => received.push(payload));

    unsubscribe();
    events.emit("stat.levelUp", { userId: "alice", stat: "mining", level: 5 });

    expect(received).toEqual([]);
  });

  test("multiple handlers on the same event all run", () => {
    const events = createGameEvents();
    let first = 0;
    let second = 0;
    events.on("entity.died", () => (first += 1));
    events.on("entity.died", () => (second += 1));

    events.emit("entity.died", {
      instanceId: "e1",
      catalogId: "goblin",
      reason: { kind: "environment", source: "fall" },
      position: [0, 0, 0],
    });

    expect(first).toBe(1);
    expect(second).toBe(1);
  });

  test("emitting an event with no handlers is a no-op", () => {
    const events = createGameEvents();
    expect(() =>
      events.emit("quest.completed", { userId: "alice", questId: "intro" }),
    ).not.toThrow();
  });

  test("subscribe behaves the same as on", () => {
    const events = createGameEvents();
    const received: unknown[] = [];
    events.subscribe("quest.accepted", (payload) => received.push(payload));

    events.emit("quest.accepted", { userId: "alice", questId: "intro" });

    expect(received).toEqual([{ userId: "alice", questId: "intro" }]);
  });
});

describe("lootDropsOf", () => {
  test("reads the drops out of a loot.granted payload", () => {
    const event: LootGrantedEvent = {
      userId: "p1",
      drops: [
        { item: "gem", count: 2 },
        { currency: "copper", count: 40 },
      ],
    };
    expect(lootDropsOf(event)).toEqual(event.drops);
  });

  test("returns [] for a payload-less entry instead of throwing", () => {
    // FeedEntry.data is `unknown`; the call site that cast without `| undefined` threw here.
    expect(lootDropsOf(undefined)).toEqual([]);
    expect(lootDropsOf(null)).toEqual([]);
  });

  test("returns [] for payloads that are not loot grants", () => {
    expect(lootDropsOf("a chat line")).toEqual([]);
    expect(lootDropsOf(42)).toEqual([]);
    expect(lootDropsOf({ userId: "p1" })).toEqual([]);
    expect(lootDropsOf({ drops: "not-an-array" })).toEqual([]);
  });

  test("drops malformed rows rather than handing a renderer a NaN count", () => {
    const mixed = { drops: [{ item: "gem", count: 2 }, null, { item: "junk" }, { item: "x", count: Number.NaN }] };
    expect(lootDropsOf(mixed)).toEqual([{ item: "gem", count: 2 }]);
  });

  test("an empty drops array reads as empty, not as absent", () => {
    expect(lootDropsOf({ drops: [] })).toEqual([]);
  });
});
