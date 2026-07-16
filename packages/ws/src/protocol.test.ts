import { expect, test } from "bun:test";

import {
  decodeWsClientMessage,
  decodeWsServerMessage,
  encodeWsMessage,
  inspectWsDecodeFailure,
  MAX_APPEARANCE_ENTRIES,
  MAX_APPEARANCE_VALUE_LENGTH,
  MAX_COMMAND_LENGTH,
  MAX_FEED_ACTION_LENGTH,
  MAX_FEED_ENTRY_BYTES,
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
    {
      v: 1,
      t: "pose",
      serverId: "srv-1",
      pose: { x: 1, y: 0, z: 2, rotationY: 0.5, rotationPitch: 0, appearance: { skin: "blue", hat: "top" } },
    },
    { v: 1, t: "join", id: 8, gameId: "wow", attributes: { visibility: "private", joinCode: "ABC123" } },
    { v: 1, t: "joinByCode", id: 9, gameId: "wow", code: "ABC123" },
    { v: 1, t: "browse", id: 10, gameId: "wow", filter: { mode: "ranked", notFull: true }, limit: 5 },
    { v: 1, t: "chatSend", id: 11, serverId: "srv-1", channelId: "global", body: "hello" },
    { v: 1, t: "subscribe", id: 12, channel: "chat", serverId: "srv-1", action: "global" },
    { v: 1, t: "voiceJoin", id: 13, serverId: "srv-1", channelId: "crew", streamId: "stream-9" },
    { v: 1, t: "voiceJoin", id: 14, serverId: "srv-1", channelId: "crew" },
    { v: 1, t: "voiceLeave", id: 15, serverId: "srv-1", channelId: "crew" },
    { v: 1, t: "voicePublish", id: 16, serverId: "srv-1", channelId: "crew", streamId: "stream-9" },
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
      channel: "presence",
      serverId: "srv-1",
      data: [
        {
          userId: "alice",
          position: { x: 0, y: 0, z: 0 },
          rotationY: 0,
          rotationPitch: 0,
          lastSeenAt: 1,
          appearance: { skin: "blue" },
        },
      ],
    },
    {
      v: 1,
      t: "update",
      channel: "chat",
      serverId: "srv-1",
      action: "global",
      data: [{ id: "msg_1", channelId: "global", fromUserId: "alice", body: "hello", at: 1 }],
    },
    {
      v: 1,
      t: "update",
      channel: "voice",
      serverId: "srv-1",
      action: "crew",
      data: [{ userId: "alice", streamId: "stream-9" }, { userId: "bob" }],
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
  expect(
    decodeWsClientMessage(
      JSON.stringify({
        v: 1,
        t: "pose",
        serverId: "s",
        pose: { x: 1, y: 0, z: 0, rotationY: 0, rotationPitch: 0, appearance: { skin: { nested: true } } },
      }),
    ),
  ).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "joinByCode", id: 1, gameId: "g" }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "browse", id: 1 }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "chatSend", id: 1, serverId: "s", channelId: "g" }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "voicePublish", id: 1, serverId: "s", channelId: "c" }))).toBeNull();
  expect(decodeWsClientMessage(JSON.stringify({ v: 1, t: "voiceJoin", id: 1, serverId: "s", channelId: "c", streamId: 5 }))).toBeNull();
  expect(decodeWsServerMessage(JSON.stringify({ v: 1, t: "reply", id: 1, ok: false }))).toBeNull();
  expect(decodeWsServerMessage(JSON.stringify({ v: 1, t: "update", channel: "nope", serverId: "s" }))).toBeNull();
});

test("decoder caps command, feed, and appearance payload sizes", () => {
  const overLongCommand = "x".repeat(MAX_COMMAND_LENGTH + 1);
  expect(
    decodeWsClientMessage(
      JSON.stringify({ v: 1, t: "runCommand", id: 1, serverId: "s", command: overLongCommand, input: null }),
    ),
  ).toBeNull();
  expect(inspectWsDecodeFailure(JSON.stringify({ v: 1, t: "runCommand", id: 1, serverId: "s", command: overLongCommand, input: null }))).toEqual({
    reason: "Command exceeds max length",
    id: 1,
  });
  expect(
    decodeWsClientMessage(
      JSON.stringify({ v: 1, t: "runCommand", id: 1, serverId: "s", command: "x".repeat(MAX_COMMAND_LENGTH), input: null }),
    ),
  ).not.toBeNull();

  const overLongAction = "x".repeat(MAX_FEED_ACTION_LENGTH + 1);
  expect(
    decodeWsClientMessage(
      JSON.stringify({ v: 1, t: "pushFeed", id: 2, serverId: "s", action: overLongAction, entry: {} }),
    ),
  ).toBeNull();
  expect(inspectWsDecodeFailure(JSON.stringify({ v: 1, t: "pushFeed", id: 2, serverId: "s", action: overLongAction, entry: {} }))).toEqual({
    reason: "Feed action exceeds max length",
    id: 2,
  });

  const oversizedEntry = { blob: "x".repeat(MAX_FEED_ENTRY_BYTES) };
  expect(
    decodeWsClientMessage(JSON.stringify({ v: 1, t: "pushFeed", id: 3, serverId: "s", action: "kill", entry: oversizedEntry })),
  ).toBeNull();
  expect(
    inspectWsDecodeFailure(JSON.stringify({ v: 1, t: "pushFeed", id: 3, serverId: "s", action: "kill", entry: oversizedEntry })),
  ).toEqual({ reason: "Feed entry exceeds max size", id: 3 });

  const base = { x: 1, y: 0, z: 2, rotationY: 0, rotationPitch: 0 };
  const tooManyTags = Object.fromEntries(
    Array.from({ length: MAX_APPEARANCE_ENTRIES + 1 }, (_, i) => [`k${i}`, "v"]),
  );
  expect(
    decodeWsClientMessage(JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, appearance: tooManyTags } })),
  ).toBeNull();
  expect(
    inspectWsDecodeFailure(JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, appearance: tooManyTags } })),
  ).toEqual({ reason: "Appearance exceeds max entries" });

  const tooLongTagValue = { skin: "x".repeat(MAX_APPEARANCE_VALUE_LENGTH + 1) };
  expect(
    decodeWsClientMessage(JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, appearance: tooLongTagValue } })),
  ).toBeNull();
  expect(
    inspectWsDecodeFailure(JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, appearance: tooLongTagValue } })),
  ).toEqual({ reason: "Appearance value exceeds max length" });
});

test("subscriptionKey namespaces channel, server, and action", () => {
  expect(subscriptionKey("feed", "srv-1", "kill")).toBe("feed|srv-1|kill");
  expect(subscriptionKey("server", "srv-1")).toBe("server|srv-1|");
});

test("pose messages with an appearance payload round-trip through the codec", () => {
  const message: WsClientMessage = {
    v: 1,
    t: "pose",
    serverId: "srv-1",
    pose: { x: 1, y: 0, z: 2, rotationY: 0.5, rotationPitch: 0, appearance: { skin: "gold", level: 3, muted: true } },
  };
  expect(decodeWsClientMessage(encodeWsMessage(message))).toEqual(message);
});

test("pose messages without appearance still validate (old-peer back-compat)", () => {
  const message: WsClientMessage = {
    v: 1,
    t: "pose",
    serverId: "srv-1",
    pose: { x: 1, y: 0, z: 2, rotationY: 0.5, rotationPitch: 0 },
  };
  expect(decodeWsClientMessage(encodeWsMessage(message))).toEqual(message);
});

test("pose validation rejects malformed appearance payloads", () => {
  const base = { x: 1, y: 0, z: 2, rotationY: 0, rotationPitch: 0 };
  expect(
    decodeWsClientMessage(JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, appearance: "gold" } })),
  ).toBeNull();
  expect(
    decodeWsClientMessage(JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, appearance: null } })),
  ).toBeNull();
  expect(
    decodeWsClientMessage(
      JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, appearance: { skin: { nested: true } } } }),
    ),
  ).toBeNull();
  expect(
    decodeWsClientMessage(
      JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, appearance: { tags: ["a", "b"] } } }),
    ),
  ).toBeNull();
  expect(
    decodeWsClientMessage(JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, appearance: {} } })),
  ).not.toBeNull();
});

test("pose validation rejects NaN and Infinity fields", () => {
  const base = { x: 1, y: 0, z: 2, rotationY: 0, rotationPitch: 0 };
  for (const field of ["x", "y", "z", "rotationY", "rotationPitch"] as const) {
    expect(
      decodeWsClientMessage(
        JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, [field]: Number.NaN } }),
      ),
    ).toBeNull();
    expect(
      decodeWsClientMessage(
        JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, [field]: Number.POSITIVE_INFINITY } }),
      ),
    ).toBeNull();
    expect(
      decodeWsClientMessage(
        JSON.stringify({ v: 1, t: "pose", serverId: "s", pose: { ...base, [field]: Number.NEGATIVE_INFINITY } }),
      ),
    ).toBeNull();
  }
});

test("inspectWsDecodeFailure reports version mismatch and malformed payloads with ids", () => {
  expect(inspectWsDecodeFailure("not json")).toEqual({ reason: "Invalid JSON" });
  expect(inspectWsDecodeFailure(JSON.stringify({ v: 2, t: "hello", id: 9, userId: "a" }))).toEqual({
    reason: "Protocol version mismatch",
    id: 9,
  });
  expect(inspectWsDecodeFailure(JSON.stringify({ v: 1, t: "hello", id: 3, userId: 1 }))).toEqual({
    reason: "Malformed message",
    id: 3,
  });
});
