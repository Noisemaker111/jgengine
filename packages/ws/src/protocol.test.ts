import { expect, test } from "bun:test";

import {
  decodeWsClientMessage,
  decodeWsServerMessage,
  encodeWsMessage,
  subscriptionKey,
  type WsClientMessage,
  type WsServerMessage,
} from "./protocol";

test("client messages round-trip through the codec", () => {
  const messages: WsClientMessage[] = [
    { v: 1, t: "hello", id: 1, userId: "alice" },
    { v: 1, t: "join", id: 2, gameId: "wow", serverId: "srv-1" },
    { v: 1, t: "leave", id: 3, serverId: "srv-1" },
    { v: 1, t: "runCommand", id: 4, serverId: "srv-1", command: "gold.grant", input: { amount: 5 } },
    { v: 1, t: "pushFeed", id: 5, serverId: "srv-1", action: "kill", entry: { who: "bob" } },
    { v: 1, t: "subscribe", id: 6, channel: "feed", serverId: "srv-1", action: "kill" },
    { v: 1, t: "unsubscribe", id: 7, channel: "server", serverId: "srv-1" },
    { v: 1, t: "pose", serverId: "srv-1", pose: { x: 1, y: 0, z: 2, rotationY: 0.5, rotationPitch: 0 } },
    { v: 1, t: "join", id: 8, gameId: "wow", attributes: { visibility: "private", joinCode: "ABC123" } },
    { v: 1, t: "joinByCode", id: 9, gameId: "wow", code: "ABC123" },
    { v: 1, t: "browse", id: 10, gameId: "wow", filter: { mode: "ranked", notFull: true }, limit: 5 },
    { v: 1, t: "chatSend", id: 11, serverId: "srv-1", channelId: "global", body: "hello" },
    { v: 1, t: "subscribe", id: 12, channel: "chat", serverId: "srv-1", action: "global" },
  ];
  for (const message of messages) {
    expect(decodeWsClientMessage(encodeWsMessage(message))).toEqual(message);
  }
});

test("server messages round-trip through the codec", () => {
  const messages: WsServerMessage[] = [
    { v: 1, t: "reply", id: 1, ok: true, result: { serverId: "srv-1", isNew: true } },
    { v: 1, t: "reply", id: 2, ok: false, reason: "Server is full" },
    { v: 1, t: "update", channel: "server", serverId: "srv-1", data: null },
    { v: 1, t: "update", channel: "feed", serverId: "srv-1", action: "kill", data: [{ who: "bob" }] },
    {
      v: 1,
      t: "update",
      channel: "presence",
      serverId: "srv-1",
      data: [{ userId: "alice", position: { x: 0, y: 0, z: 0 }, rotationY: 0, rotationPitch: 0, lastSeenAt: 1 }],
    },
    {
      v: 1,
      t: "update",
      channel: "chat",
      serverId: "srv-1",
      action: "global",
      data: [{ id: "msg_1", channelId: "global", fromUserId: "alice", body: "hello", at: 1 }],
    },
  ];
  for (const message of messages) {
    expect(decodeWsServerMessage(encodeWsMessage(message))).toEqual(message);
  }
});

test("decoder rejects garbage, wrong versions, and malformed fields", () => {
  expect(decodeWsClientMessage("not json")).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 2, t: "hello", id: 1, userId: "a" }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "unknown", id: 1 }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "hello", id: "1", userId: "a" }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { x: 1 } }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "joinByCode", id: 1, gameId: "g" }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "browse", id: 1 }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "chatSend", id: 1, serverId: "s", channelId: "g" }))).toBeNull();
  expect(decodeWsServerMessage(JSON.stringify({ v: 1, t: "reply", id: 1, ok: false }))).toBeNull();
  expect(decodeWsServerMessage(JSON.stringify({ v: 1, t: "update", channel: "nope", serverId: "s" }))).toBeNull();
});

test("subscriptionKey namespaces channel, server, and action", () => {
  expect(subscriptionKey("feed", "srv-1", "kill")).toBe("feed|srv-1|kill");
  expect(subscriptionKey("server", "srv-1")).toBe("server|srv-1|");
});
