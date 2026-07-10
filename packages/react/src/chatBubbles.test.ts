import { describe, expect, test } from "bun:test";
import type { ChatMessage } from "@jgengine/core/game/chat";

import { latestChatBubbles } from "./chatBubbles";

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "msg_1",
    channelId: "proximity",
    fromUserId: "alice",
    body: "hi",
    at: 1_000,
    ...overrides,
  };
}

describe("latestChatBubbles", () => {
  test("returns an empty list for no messages", () => {
    expect(latestChatBubbles([], 1_000, 4_000)).toEqual([]);
  });

  test("drops messages older than the ttl window", () => {
    const messages = [
      message({ id: "m1", fromUserId: "alice", at: 1_000 }),
      message({ id: "m2", fromUserId: "bob", at: 5_001 }),
    ];
    expect(latestChatBubbles(messages, 9_000, 4_000).map((bubble) => bubble.id)).toEqual(["m2"]);
  });

  test("a message exactly at the ttl boundary is expired (strictly greater than cutoff)", () => {
    const messages = [message({ id: "m1", fromUserId: "alice", at: 5_000 })];
    expect(latestChatBubbles(messages, 9_000, 4_000)).toEqual([]);
  });

  test("a message one ms inside the ttl boundary is kept", () => {
    const messages = [message({ id: "m1", fromUserId: "alice", at: 5_001 })];
    expect(latestChatBubbles(messages, 9_000, 4_000).map((bubble) => bubble.id)).toEqual(["m1"]);
  });

  test("keeps only the newest live message per fromUserId", () => {
    const messages = [
      message({ id: "m1", fromUserId: "alice", at: 8_000, body: "first" }),
      message({ id: "m2", fromUserId: "alice", at: 8_500, body: "second" }),
      message({ id: "m3", fromUserId: "bob", at: 8_200, body: "hey" }),
    ];
    const bubbles = latestChatBubbles(messages, 9_000, 4_000);
    expect(bubbles).toHaveLength(2);
    const alice = bubbles.find((bubble) => bubble.fromUserId === "alice");
    expect(alice?.id).toBe("m2");
    expect(alice?.body).toBe("second");
  });

  test("newest-first-per-user survives out-of-order input", () => {
    const messages = [
      message({ id: "m2", fromUserId: "alice", at: 8_500, body: "second" }),
      message({ id: "m1", fromUserId: "alice", at: 8_000, body: "first" }),
    ];
    const bubbles = latestChatBubbles(messages, 9_000, 4_000);
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]?.id).toBe("m2");
  });

  test("returns bubbles in ascending at order", () => {
    const messages = [
      message({ id: "m1", fromUserId: "alice", at: 8_500 }),
      message({ id: "m2", fromUserId: "bob", at: 8_100 }),
      message({ id: "m3", fromUserId: "carol", at: 8_900 }),
    ];
    const bubbles = latestChatBubbles(messages, 9_000, 4_000);
    expect(bubbles.map((bubble) => bubble.fromUserId)).toEqual(["bob", "alice", "carol"]);
  });
});
