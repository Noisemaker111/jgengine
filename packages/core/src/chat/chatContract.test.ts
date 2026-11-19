import { describe, expect, test } from "bun:test";

import { createLocalChatSync } from "./chatContract";

describe("createLocalChatSync", () => {
  test("send appends and notifies channel subscribers", async () => {
    let time = 5_000;
    const sync = createLocalChatSync({ userId: "alice", now: () => time });
    const seen: string[][] = [];
    const unsubscribe = sync.subscribe("global", (messages) =>
      void seen.push(messages.map((message) => message.body)),
    );
    expect(seen).toEqual([[]]);

    expect(await sync.send("global", "hello")).toEqual({ ok: true });
    time += 1;
    expect(await sync.send("global", "again")).toEqual({ ok: true });
    expect(seen).toEqual([[], ["hello"], ["hello", "again"]]);

    unsubscribe();
    await sync.send("global", "unheard");
    expect(seen).toHaveLength(3);
  });

  test("rejects empty bodies and scopes messages per channel", async () => {
    const sync = createLocalChatSync({ userId: "bob" });
    expect(await sync.send("global", "   ")).toEqual({ ok: false, reason: "empty message" });
    await sync.send("party", "party only");
    const read = (channel: string) => {
      let messages: readonly { fromUserId: string }[] = [];
      sync.subscribe(channel, (latest) => void (messages = latest))();
      return messages;
    };
    expect(read("global")).toEqual([]);
    expect(read("party").map((message) => message.fromUserId)).toEqual(["bob"]);
  });

  test("bounds history to the configured limit", async () => {
    const sync = createLocalChatSync({ historyLimit: 2 });
    await sync.send("global", "one");
    await sync.send("global", "two");
    await sync.send("global", "three");
    let latest: readonly { body: string }[] = [];
    sync.subscribe("global", (messages) => void (latest = messages));
    expect(latest.map((message) => message.body)).toEqual(["two", "three"]);
  });
});
