import { describe, expect, test } from "bun:test";

import { createChatFilter, normalizeChatText } from "@jgengine/core/game/chatFilter";
import { createChat } from "@jgengine/core/game/chat";
import { createGameEvents } from "./events";

function sentMessage(result: ReturnType<ReturnType<typeof createChat>["send"]>) {
  if ("reason" in result) throw new Error(result.reason);
  return result;
}

describe("normalizeChatText", () => {
  test("lowercases and applies leet substitutions", () => {
    expect(normalizeChatText("D4NG")).toBe("dang");
    expect(normalizeChatText("d@ng!")).toBe("dangi");
    expect(normalizeChatText("h3ll0")).toBe("hello");
    expect(normalizeChatText("plain text")).toBe("plain text");
  });
});

describe("createChatFilter mask mode", () => {
  test("masks a matched token, preserving length and surrounding text/punctuation", () => {
    const filter = createChatFilter({ blockedWords: ["dang"] });
    const result = filter.apply("well, dang it!");
    expect(result.ok).toBe(true);
    expect(result.body).toBe("well, **** it!");
    expect(result.matched).toEqual(["dang"]);
  });

  test("catches leet variants of a blocked word", () => {
    const filter = createChatFilter({ blockedWords: ["dang"] });
    expect(filter.apply("d4ng").body).toBe("****");
    expect(filter.apply("D@NG").body).toBe("****");
  });

  test("does not match a blocked word as a substring of a larger token", () => {
    const filter = createChatFilter({ blockedWords: ["ass"] });
    const result = filter.apply("call the assassin");
    expect(result.ok).toBe(true);
    expect(result.body).toBe("call the assassin");
    expect(result.matched).toEqual([]);
  });

  test("masks multiple matches and dedupes matched list in blocked-list order", () => {
    const filter = createChatFilter({ blockedWords: ["foo", "bar"] });
    const result = filter.apply("bar foo bar again foo");
    expect(result.ok).toBe(true);
    expect(result.body).toBe("*** *** *** again ***");
    expect(result.matched).toEqual(["foo", "bar"]);
  });

  test("supports a custom mask character", () => {
    const filter = createChatFilter({ blockedWords: ["dang"], mask: "#" });
    expect(filter.apply("dang").body).toBe("####");
  });

  test("unicode text passes through untouched", () => {
    const filter = createChatFilter({ blockedWords: ["dang"] });
    const result = filter.apply("こんにちは世界 café");
    expect(result.ok).toBe(true);
    expect(result.body).toBe("こんにちは世界 café");
    expect(result.matched).toEqual([]);
  });

  test("empty blocked list is always clean", () => {
    const filter = createChatFilter({ blockedWords: [] });
    const result = filter.apply("dang it");
    expect(result.ok).toBe(true);
    expect(result.body).toBe("dang it");
    expect(result.matched).toEqual([]);
  });

  test("no match leaves body unchanged", () => {
    const filter = createChatFilter({ blockedWords: ["dang"] });
    const result = filter.apply("hello world");
    expect(result.ok).toBe(true);
    expect(result.body).toBe("hello world");
    expect(result.matched).toEqual([]);
  });
});

describe("createChatFilter reject mode", () => {
  test("rejects on any match and returns the body unchanged", () => {
    const filter = createChatFilter({ blockedWords: ["dang"], mode: "reject" });
    const result = filter.apply("well dang it");
    expect(result.ok).toBe(false);
    expect(result.body).toBe("well dang it");
    expect(result.matched).toEqual(["dang"]);
  });

  test("clean text passes through", () => {
    const filter = createChatFilter({ blockedWords: ["dang"], mode: "reject" });
    const result = filter.apply("all good here");
    expect(result.ok).toBe(true);
    expect(result.body).toBe("all good here");
    expect(result.matched).toEqual([]);
  });
});

describe("createChat with a chat filter", () => {
  function createTestChat(filter: ReturnType<typeof createChatFilter>) {
    const events = createGameEvents();
    let time = 1_000;
    const chat = createChat({ events, now: () => time, filter });
    return { chat, tick: (ms: number) => (time += ms) };
  }

  test("masked body lands in history", () => {
    const filter = createChatFilter({ blockedWords: ["dang"] });
    const { chat } = createTestChat(filter);
    const result = sentMessage(chat.send("alice", "global", "well dang it"));
    expect(result.message.body).toBe("well **** it");
    expect(chat.history("global").map((message) => message.body)).toEqual(["well **** it"]);
  });

  test("reject mode returns a filtered reason and nothing lands in history", () => {
    const filter = createChatFilter({ blockedWords: ["dang"], mode: "reject" });
    const { chat } = createTestChat(filter);
    expect(chat.send("alice", "global", "well dang it")).toEqual({ reason: "filtered" });
    expect(chat.history("global")).toEqual([]);
  });
});
