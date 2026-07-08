import { describe, expect, test } from "bun:test";

import { createLocalChatTransport } from "./chatContract";

describe("createLocalChatTransport", () => {
  test("send appends and notifies channel subscribers", async () => {
    let time = 5_000;
    const { sync, actions } = createLocalChatTransport({ userId: "alice", now: () => time });
    const seen: string[][] = [];
    const unsubscribe = sync.subscribe("global", (messages) =>
      void seen.push(messages.map((message) => message.body)),
    );
    expect(seen).toEqual([[]]);

    expect(await actions.sendMessage({ channelId: "global", body: "hello" })).toEqual({ ok: true });
    time += 1;
    expect(await sync.send("global", "again")).toEqual({ ok: true });
    expect(seen).toEqual([[], ["hello"], ["hello", "again"]]);

    unsubscribe();
    await sync.send("global", "unheard");
    expect(seen).toHaveLength(3);
  });

  test("rejects empty bodies and scopes messages per channel", async () => {
    const { sync, transport } = createLocalChatTransport({ userId: "bob" });
    expect(await sync.send("global", "   ")).toEqual({ ok: false, reason: "empty message" });
    await sync.send("party", "party only");
    expect(transport.useMessages("global")).toEqual([]);
    expect(transport.useMessages("party")?.map((message) => message.fromUserId)).toEqual(["bob"]);
    expect(transport.useMessages("skip")).toBeUndefined();
  });

  test("bounds history to the configured limit", async () => {
    const { sync } = createLocalChatTransport({ historyLimit: 2 });
    await sync.send("global", "one");
    await sync.send("global", "two");
    await sync.send("global", "three");
    let latest: readonly { body: string }[] = [];
    sync.subscribe("global", (messages) => void (latest = messages));
    expect(latest.map((message) => message.body)).toEqual(["two", "three"]);
  });
});
