import { describe, expect, test } from "bun:test";

import { createWireDecoder, createWireEncoder, decodeWireValue, encodeWireValue, WIRE_DESYNC } from "./binaryWire";
import {
  decodeWsClientMessage,
  decodeWsServerFrame,
  encodeWsFrame,
  type WsClientMessage,
  type WsServerMessage,
} from "./protocol";

const jsonShape = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const CLIENT_MESSAGES: WsClientMessage[] = [
  { v: 1, t: "ping", id: 1, at: 1_700_000_000_123 },
  { v: 1, t: "hello", id: 2, userId: "alice", token: "tok", codec: "binary" },
  { v: 1, t: "join", id: 3, gameId: "g", serverId: "s", attributes: { map: "a", ranked: true, size: 4 }, code: "ABCD", role: "spectator", sessionId: "sess" },
  { v: 1, t: "joinByCode", id: 4, gameId: "g", code: "XYZ", role: "player" },
  { v: 1, t: "browse", id: 5, gameId: "g", filter: { map: "a" }, limit: 10 },
  { v: 1, t: "leave", id: 6, serverId: "s", sessionId: "sess" },
  { v: 1, t: "runCommand", id: 7, serverId: "s", command: "cast", input: { spell: "fire", at: [1.5, -2, 3e9], nested: { a: [null, true, false, "é✓"] } } },
  { v: 1, t: "pushFeed", id: 8, serverId: "s", action: "kills", entry: { by: "alice", n: -3 } },
  { v: 1, t: "subscribe", id: 9, channel: "server", serverId: "s" },
  { v: 1, t: "unsubscribe", id: 10, channel: "feed", serverId: "s", action: "kills" },
  { v: 1, t: "pose", serverId: "s", pose: { x: 1.25, y: 0, z: -9.75, rotationY: 3.14159, rotationPitch: -0.5, appearance: { skin: "red", mounted: true, level: 7 } } },
  { v: 1, t: "chatSend", id: 11, serverId: "s", channelId: "general", body: "hello 世界" },
  { v: 1, t: "voiceJoin", id: 12, serverId: "s", channelId: "v", streamId: "st" },
  { v: 1, t: "voiceLeave", id: 13, serverId: "s", channelId: "v" },
  { v: 1, t: "voicePublish", id: 14, serverId: "s", channelId: "v", streamId: "st2" },
];

const view = { serverId: "s", gameId: "g", revision: 4, memberUserIds: ["a", "b"], serverState: { n: 1 }, updatedAt: 99 };

const SERVER_MESSAGES: WsServerMessage[] = [
  { v: 1, t: "pong", id: 1, at: 5, serverAt: 6 },
  { v: 1, t: "reply", id: 2, ok: true, result: { userId: "alice", list: [1, 2, 3] } },
  { v: 1, t: "reply", id: 3, ok: true },
  { v: 1, t: "reply", id: 4, ok: false, reason: "nope" },
  { v: 1, t: "update", channel: "server", serverId: "s", data: view },
  { v: 1, t: "update", channel: "server", serverId: "s", data: null },
  { v: 1, t: "update", channel: "player", serverId: "s", data: { userId: "a", gameId: "g", playerState: { hp: 3 }, updatedAt: 1 } },
  { v: 1, t: "update", channel: "feed", serverId: "s", action: "kills", data: [{ a: 1 }, { a: 2 }] },
  { v: 1, t: "update", channel: "presence", serverId: "s", data: [{ userId: "a", x: 1, y: 2, z: 3, rotationY: 0.5, rotationPitch: 0, appearance: { s: "x" } }] as never },
  { v: 1, t: "update", channel: "chat", serverId: "s", action: "general", data: [{ id: "m1", channelId: "general", fromUserId: "a", body: "hi", at: 4 }] },
  { v: 1, t: "update", channel: "voice", serverId: "s", action: "v", data: [{ userId: "a", streamId: "x" }, { userId: "b" }] },
];

function entity(id: string, x: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: "npc",
    position: [x, 0, 2],
    rotationY: 1,
    rotationX: 0,
    rotationZ: 0,
    velocity: [0, 0, 0],
    role: "npc",
    movement: "walk",
    behaviors: [],
    meta: { team: "red" },
    ...extra,
  };
}

function baseline(revision: number, entities: unknown[]): WsServerMessage {
  return {
    v: 1,
    t: "update",
    channel: "server",
    serverId: "s",
    data: { ...view, serverState: { kind: "baseline", revision, snapshot: { entities, stats: { a: { hp: 1 } }, store: [["k", 1]] } } as never },
  };
}

function diff(revision: number, base: number, entities: unknown[], removedEntities: string[] = []): WsServerMessage {
  return {
    v: 1,
    t: "update",
    channel: "server",
    serverId: "s",
    data: {
      ...view,
      serverState: {
        kind: "diff",
        revision,
        diff: { revision, baseRevision: base, entities, removedEntities, stats: {}, removedStats: [], store: [], removedStore: [], modules: {}, removedModules: [] },
      } as never,
    },
  };
}

function entitiesOf(message: unknown): unknown[] {
  const m = message as { data: { serverState: { snapshot?: { entities: unknown[] }; diff?: { entities: unknown[] } } } };
  return m.data.serverState.snapshot?.entities ?? m.data.serverState.diff?.entities ?? [];
}

describe("binary wire: every protocol message", () => {
  test("client messages round-trip through the binary codec and the same validator as JSON", () => {
    for (const message of CLIENT_MESSAGES) {
      const frame = encodeWsFrame(message, "binary");
      expect(frame).toBeInstanceOf(Uint8Array);
      expect(decodeWsClientMessage(frame)).toEqual(jsonShape(message) as WsClientMessage);
      expect(decodeWsClientMessage(encodeWsFrame(message, "json"))).toEqual(jsonShape(message) as WsClientMessage);
    }
  });

  test("server messages round-trip statefully and stay smaller than JSON", () => {
    const encoder = createWireEncoder();
    const decoder = createWireDecoder();
    for (const message of SERVER_MESSAGES) {
      const frame = encoder.encode(message);
      expect(decodeWsServerFrame(frame, decoder)).toEqual(jsonShape(message) as WsServerMessage);
      expect(frame.byteLength).toBeLessThan(JSON.stringify(message).length);
    }
  });

  test("malformed binary frames are rejected, never thrown", () => {
    expect(decodeWireValue(new Uint8Array([0xb1, 0, 7, 5]))).toBeNull();
    expect(decodeWireValue(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(decodeWireValue(new Uint8Array(0))).toBeNull();
    const good = encodeWireValue({ v: 1, t: "ping", id: 1, at: 2 });
    expect(decodeWireValue(good.subarray(0, good.length - 1))).toBeNull();
    expect(decodeWsClientMessage(new Uint8Array([0xb1, 0, 1]))).toBeNull();
  });

  test("scalar edge cases keep JSON parity", () => {
    const value = { a: 0, b: -0.5, c: 2 ** 40, d: -(2 ** 40), e: 1e300, f: "", g: [], h: {}, i: Number.NaN };
    expect(decodeWireValue(encodeWireValue(value))).toEqual(jsonShape(value));
  });
});

describe("binary wire: entity deltas", () => {
  test("a baseline then diffs rebuild the entities at the configured precision", () => {
    const encoder = createWireEncoder({ position: 2, angle: 3 });
    const decoder = createWireDecoder();
    const first = baseline(1, [entity("a", 1.234), entity("b", 5)]);
    const decoded = decodeWsServerFrame(encoder.encode(first), decoder);
    expect(entitiesOf(decoded)).toEqual([entity("a", 1.23), entity("b", 5)]);

    const second = diff(2, 1, [entity("a", 1.5, { rotationY: 1.23456 })], []);
    expect(entitiesOf(decodeWsServerFrame(encoder.encode(second), decoder))).toEqual([entity("a", 1.5, { rotationY: 1.235 })]);

    const third = diff(3, 2, [entity("c", 9, { hidden: true })], ["b"]);
    const decodedThird = decodeWsServerFrame(encoder.encode(third), decoder);
    expect(entitiesOf(decodedThird)).toEqual([entity("c", 9, { hidden: true })]);
    expect((decodedThird as unknown as { data: { serverState: { diff: { removedEntities: string[] } } } }).data.serverState.diff.removedEntities).toEqual(["b"]);

    const fourth = diff(4, 3, [entity("c", 9)]);
    expect(entitiesOf(decodeWsServerFrame(encoder.encode(fourth), decoder))).toEqual([entity("c", 9)]);
  });

  test("a moved entity costs a few bytes, far below its JSON", () => {
    const encoder = createWireEncoder();
    const decoder = createWireDecoder();
    decodeWsServerFrame(encoder.encode(baseline(1, [entity("a", 1)])), decoder);
    const moved = diff(2, 1, [entity("a", 1.05)]);
    const frame = encoder.encode(moved);
    expect(frame.byteLength).toBeLessThan(JSON.stringify(moved).length / 4);
    expect(entitiesOf(decodeWsServerFrame(frame, decoder))).toEqual([entity("a", 1.05)]);
  });

  test("changes below the precision send no entity record", () => {
    const encoder = createWireEncoder({ position: 1 });
    const decoder = createWireDecoder();
    decodeWsServerFrame(encoder.encode(baseline(1, [entity("a", 1)])), decoder);
    const frame = encoder.encode(diff(2, 1, [entity("a", 1.01)]));
    expect(entitiesOf(decodeWsServerFrame(frame, decoder))).toEqual([]);
  });

  test("precision is configurable per side and validated", () => {
    const coarse = createWireEncoder({ position: 0, angle: 1 });
    const decoder = createWireDecoder();
    const decoded = decodeWsServerFrame(coarse.encode(baseline(1, [entity("a", 12.6, { rotationY: 2.26 })])), decoder);
    expect(entitiesOf(decoded)).toEqual([entity("a", 13, { rotationY: 2.3 })]);
    expect(() => createWireEncoder({ position: 9 })).toThrow("precision");
    expect(() => createWireEncoder({ angle: -1 })).toThrow("precision");
  });

  test("removed entity ids free their varint slots for reuse", () => {
    const encoder = createWireEncoder();
    const decoder = createWireDecoder();
    decodeWsServerFrame(encoder.encode(baseline(1, [entity("a", 1), entity("b", 2)])), decoder);
    decodeWsServerFrame(encoder.encode(diff(2, 1, [], ["a"])), decoder);
    const out = decodeWsServerFrame(encoder.encode(diff(3, 2, [entity("z", 4), entity("b", 3)])), decoder);
    expect(entitiesOf(out)).toEqual([entity("z", 4), entity("b", 3)]);
  });

  test("a rest field that disappears is removed on the receiver", () => {
    const encoder = createWireEncoder();
    const decoder = createWireDecoder();
    decodeWsServerFrame(encoder.encode(baseline(1, [entity("a", 1, { hidden: true, size: 2 })])), decoder);
    const out = decodeWsServerFrame(encoder.encode(diff(2, 1, [entity("a", 1, { size: 3 })])), decoder);
    expect(entitiesOf(out)).toEqual([entity("a", 1, { size: 3 })]);
  });

  test("a skipped frame is reported as desync, and a baseline recovers", () => {
    const encoder = createWireEncoder();
    const decoder = createWireDecoder();
    decodeWsServerFrame(encoder.encode(baseline(1, [entity("a", 1)])), decoder);
    encoder.encode(diff(2, 1, [entity("a", 2)]));
    const lost = encoder.encode(diff(3, 2, [entity("a", 3)]));
    expect(decodeWsServerFrame(lost, decoder)).toBe(WIRE_DESYNC);
    const fresh = createWireEncoder();
    expect(entitiesOf(decodeWsServerFrame(fresh.encode(baseline(4, [entity("a", 3)])), decoder))).toEqual([entity("a", 3)]);
    expect(entitiesOf(decodeWsServerFrame(fresh.encode(diff(5, 4, [entity("a", 4)])), decoder))).toEqual([entity("a", 4)]);
  });

  test("entities the codec cannot delta fall back to the generic value frame", () => {
    const encoder = createWireEncoder();
    const decoder = createWireDecoder();
    const odd = baseline(1, [{ id: "x", position: "far" }]);
    expect(decodeWsServerFrame(encoder.encode(odd), decoder)).toEqual(jsonShape(odd) as WsServerMessage);
  });

  test("streams for different servers stay independent", () => {
    const encoder = createWireEncoder();
    const decoder = createWireDecoder();
    const other = (message: WsServerMessage): WsServerMessage => ({ ...message, serverId: "t" } as WsServerMessage);
    decodeWsServerFrame(encoder.encode(baseline(1, [entity("a", 1)])), decoder);
    decodeWsServerFrame(encoder.encode(other(baseline(1, [entity("a", 7)]))), decoder);
    const out = decodeWsServerFrame(encoder.encode(diff(2, 1, [entity("a", 2)])), decoder);
    expect(entitiesOf(out)).toEqual([entity("a", 2)]);
  });
});
