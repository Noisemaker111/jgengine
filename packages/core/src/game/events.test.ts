import { describe, expect, test } from "bun:test";

import { createGameEvents } from "./events";

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
