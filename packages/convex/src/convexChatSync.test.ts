import { expect, test } from "bun:test";
import { anyApi, getFunctionName, type FunctionReference } from "convex/server";

import type { ChatMessage } from "@jgengine/core/chat/chat";

import { createConvexGameChatSync } from "./convexChatSync";
import type { ConvexGameClient } from "./createConvexGameTransport";

/**
 * The two client calls the chat uses, the way Convex's client behaves: a watched query holds the latest
 * result and calls back on each update; a mutation resolves with the function's return.
 */
function convexClient() {
  const watches: { name: string; args: Record<string, unknown>; result: unknown; listeners: Set<() => void> }[] = [];
  const mutations: { name: string; args: Record<string, unknown> }[] = [];
  let reply: unknown = null;
  const client = {
    watchQuery(query: FunctionReference<"query">, args: Record<string, unknown>) {
      const watch = { name: getFunctionName(query), args, result: undefined as unknown, listeners: new Set<() => void>() };
      watches.push(watch);
      return {
        localQueryResult: () => watch.result,
        onUpdate(listener: () => void) {
          watch.listeners.add(listener);
          return () => watch.listeners.delete(listener);
        },
        journal: () => undefined,
      };
    },
    async mutation(fn: FunctionReference<"mutation">, args: Record<string, unknown>) {
      mutations.push({ name: getFunctionName(fn), args });
      return reply;
    },
  } as unknown as ConvexGameClient; // type-escape: the two calls under test, not the whole client
  const push = (index: number, result: unknown) => {
    watches[index]!.result = result;
    for (const listener of watches[index]!.listeners) listener();
  };
  return { client, watches, mutations, push, replyWith: (value: unknown) => void (reply = value) };
}

const functions = { messages: anyApi.worldChat!.messages as FunctionReference<"query">, sendMessage: anyApi.worldChat!.sendMessage as FunctionReference<"mutation"> };
const row = (id: string, body: string): ChatMessage => ({ id, channelId: "world", fromUserId: "alice", body, at: 1 });

test("a channel subscription follows the live query until it is dropped", () => {
  const convex = convexClient();
  const sync = createConvexGameChatSync(convex.client, functions, { extraArgs: { worldId: "w1" } });
  const seen: string[][] = [];
  const stop = sync.subscribe("world", (messages) => void seen.push(messages.map((message) => message.body)));
  expect(convex.watches.map((watch) => [watch.name, watch.args])).toEqual([["worldChat:messages", { worldId: "w1", channelId: "world" }]]);
  // Nothing until the query has a result, then every update.
  expect(seen).toEqual([]);
  convex.push(0, [row("1", "hi")]);
  convex.push(0, [row("1", "hi"), row("2", "there")]);
  expect(seen).toEqual([["hi"], ["hi", "there"]]);
  stop();
  convex.push(0, [row("3", "unheard")]);
  expect(seen).toHaveLength(2);
});

test("rows map to messages, and send passes the host's verdict through", async () => {
  const convex = convexClient();
  const sync = createConvexGameChatSync<{ key: string; text: string }>(convex.client, functions, {
    mapRow: (raw) => ({ id: raw.key, channelId: "world", fromUserId: "bob", body: raw.text, at: 0 }),
  });
  let latest: readonly ChatMessage[] = [];
  sync.subscribe("world", (messages) => void (latest = messages));
  convex.push(0, [{ key: "k1", text: "mapped" }]);
  expect(latest.map((message) => [message.id, message.body])).toEqual([["k1", "mapped"]]);

  expect(await sync.send("world", "hello")).toEqual({ ok: true });
  convex.replyWith({ ok: false, reason: "slow down" });
  expect(await sync.send("world", "again")).toEqual({ ok: false, reason: "slow down" });
  expect(convex.mutations).toEqual([
    { name: "worldChat:sendMessage", args: { channelId: "world", body: "hello" } },
    { name: "worldChat:sendMessage", args: { channelId: "world", body: "again" } },
  ]);
});
