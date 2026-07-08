import { describe, expect, test } from "bun:test";

import { createChat, createChatRateLimiter, whisperChannelId, type ChatDeps } from "./chat";
import { createGameEvents } from "./events";

function sentMessage(result: ReturnType<ReturnType<typeof createChat>["send"]>) {
  if ("reason" in result) throw new Error(result.reason);
  return result;
}

function createTestChat(overrides?: Partial<ChatDeps>) {
  const events = createGameEvents();
  const emitted: { channelId: string; fromUserId: string; recipients?: readonly string[] }[] = [];
  events.on("chat.message", (event) =>
    void emitted.push({
      channelId: event.channelId,
      fromUserId: event.fromUserId,
      ...(event.recipients === undefined ? {} : { recipients: event.recipients }),
    }),
  );
  let time = 1_000;
  const chat = createChat({ events, now: () => time, ...overrides });
  return { chat, emitted, tick: (ms: number) => (time += ms) };
}

describe("chat channels", () => {
  test("global send reaches everyone and lands in history", () => {
    const { chat, emitted } = createTestChat();
    const result = sentMessage(chat.send("alice", "global", "  hello world  "));
    expect(result.recipients).toBe("all");
    expect(result.message.body).toBe("hello world");
    expect(chat.history("global").map((message) => message.body)).toEqual(["hello world"]);
    expect(emitted).toEqual([{ channelId: "global", fromUserId: "alice" }]);
  });

  test("rejects empty, oversized, and unknown-channel sends", () => {
    const { chat } = createTestChat({ maxBodyLength: 10 });
    expect(chat.send("alice", "global", "   ")).toEqual({ reason: "empty message" });
    expect(chat.send("alice", "global", "x".repeat(11))).toEqual({ reason: "message too long" });
    expect(chat.send("alice", "nowhere", "hi")).toEqual({ reason: 'unknown channel "nowhere"' });
  });

  test("party chat requires a party and excludes the sender from recipients", () => {
    const members = new Map<string, string[]>([["alice", ["alice", "bob", "carol"]]]);
    const { chat } = createTestChat({
      party: { membersOf: (userId) => members.get(userId) ?? [] },
    });
    expect(chat.send("dave", "party", "anyone?")).toEqual({ reason: "not in a party" });
    const result = sentMessage(chat.send("alice", "party", "pull in 3"));
    expect(result.recipients).toEqual(["bob", "carol"]);
  });

  test("proximity chat resolves nearby player entities via the spatial seam", () => {
    const positions = new Map<string, { position: readonly [number, number, number]; role: string }>([
      ["alice", { position: [0, 0, 0], role: "player" }],
      ["bob", { position: [5, 0, 0], role: "player" }],
      ["grunt", { position: [3, 0, 0], role: "enemy" }],
      ["carol", { position: [500, 0, 0], role: "player" }],
    ]);
    const { chat } = createTestChat({
      proximity: {
        entities: { get: (id) => positions.get(id) ?? null },
        spatial: {
          inRadius: (center, radius, filter) =>
            [...positions.entries()]
              .filter(([, entry]) => Math.abs(entry.position[0] - center[0]) <= radius)
              .map(([id]) => id)
              .filter((id) => filter === undefined || filter(id)),
        },
      },
    });
    expect(chat.send("ghost", "proximity", "boo")).toEqual({
      reason: 'entity "ghost" is not spawned',
    });
    const result = sentMessage(chat.send("alice", "proximity", "over here"));
    expect(result.recipients).toEqual(["bob"]);
  });

  test("register adds custom channels with their own limits", () => {
    const { chat } = createTestChat();
    chat.register({ id: "trade", kind: "global", historyLimit: 2 });
    chat.send("alice", "trade", "one");
    chat.send("alice", "trade", "two");
    chat.send("alice", "trade", "three");
    expect(chat.history("trade").map((message) => message.body)).toEqual(["two", "three"]);
    expect(chat.channels().map((def) => def.id)).toEqual(["global", "party", "proximity", "trade"]);
  });
});

describe("chat whisper and mute", () => {
  test("whisper reaches only the target on a stable pair channel", () => {
    const { chat, emitted } = createTestChat();
    expect(whisperChannelId("bob", "alice")).toBe("whisper:alice:bob");
    expect(chat.whisper("alice", "alice", "hi me")).toEqual({ reason: "cannot whisper yourself" });
    const result = sentMessage(chat.whisper("alice", "bob", "psst"));
    expect(result.message.channelId).toBe("whisper:alice:bob");
    expect(result.recipients).toEqual(["bob"]);
    sentMessage(chat.whisper("bob", "alice", "yeah?"));
    expect(chat.history("whisper:alice:bob").map((message) => message.body)).toEqual(["psst", "yeah?"]);
    expect(emitted.every((event) => event.recipients?.length === 1)).toBe(true);
    expect(chat.send("mallory", "whisper:alice:bob", "let me in")).toEqual({
      reason: "not a participant of this whisper",
    });
  });

  test("blocked users cannot whisper and are dropped from recipients and history", () => {
    const blocked = new Map<string, string[]>([["bob", ["mallory"]]]);
    const members = new Map<string, string[]>([["mallory", ["mallory", "bob", "carol"]]]);
    const { chat } = createTestChat({
      blockedBy: (userId) => blocked.get(userId) ?? [],
      party: { membersOf: (userId) => members.get(userId) ?? [] },
    });
    expect(chat.whisper("mallory", "bob", "hey")).toEqual({ reason: "blocked" });
    expect(chat.whisper("bob", "mallory", "hey")).toEqual({ reason: "blocked" });

    const result = sentMessage(chat.send("mallory", "party", "im nice now"));
    expect(result.recipients).toEqual(["carol"]);
    expect(chat.history("party", { viewerUserId: "bob" })).toEqual([]);
    expect(chat.history("party", { viewerUserId: "carol" })).toHaveLength(1);
  });
});

describe("chat rate limit and history", () => {
  test("rate limit rejects a burst and recovers after the window", () => {
    const { chat, tick } = createTestChat({ defaultRateLimit: { count: 2, perMs: 1_000 } });
    sentMessage(chat.send("alice", "global", "one"));
    sentMessage(chat.send("alice", "global", "two"));
    expect(chat.send("alice", "global", "three")).toEqual({ reason: "rate limited" });
    sentMessage(chat.send("bob", "global", "unaffected"));
    tick(1_001);
    sentMessage(chat.send("alice", "global", "back"));
  });

  test("history obeys limit option and ring bound", () => {
    const { chat } = createTestChat({ defaultRateLimit: { count: 1_000, perMs: 1_000 } });
    for (let index = 0; index < 5; index += 1) chat.send("alice", "global", `m${index}`);
    expect(chat.history("global", { limit: 2 }).map((message) => message.body)).toEqual(["m3", "m4"]);
  });

  test("snapshot and hydrate round-trip messages and id counter", () => {
    const { chat } = createTestChat();
    sentMessage(chat.send("alice", "global", "before"));
    const restoredHarness = createTestChat();
    restoredHarness.chat.hydrate(chat.snapshot());
    expect(restoredHarness.chat.history("global").map((message) => message.body)).toEqual(["before"]);
    const next = sentMessage(restoredHarness.chat.send("bob", "global", "after"));
    expect(next.message.id).toBe("msg_2");
  });
});

describe("createChatRateLimiter", () => {
  test("sliding window is per key", () => {
    const limiter = createChatRateLimiter({ count: 2, perMs: 100 });
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 10)).toBe(true);
    expect(limiter.allow("a", 20)).toBe(false);
    expect(limiter.allow("b", 20)).toBe(true);
    expect(limiter.allow("a", 111)).toBe(true);
  });
});
