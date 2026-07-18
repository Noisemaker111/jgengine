import { describe, expect, test } from "bun:test";

import { convex, offline, ws, wsPresence } from "@jgengine/core/runtime/adapter";

import {
  buildEditorNetworkSnapshot,
  isNetworkMultiplayerConfigured,
} from "./networkSnapshot";

describe("buildEditorNetworkSnapshot", () => {
  test("offline games report offline adapter and null authority", () => {
    const snapshot = buildEditorNetworkSnapshot({ gameId: "solo", multiplayer: offline() });
    expect(snapshot).toEqual({
      gameId: "solo",
      adapterKind: "offline",
      authority: null,
    });
    expect(isNetworkMultiplayerConfigured(snapshot)).toBe(false);
  });

  test("missing multiplayer is unknown/offline-like", () => {
    const snapshot = buildEditorNetworkSnapshot({ gameId: "solo", multiplayer: undefined });
    expect(snapshot.adapterKind).toBe("unknown");
    expect(snapshot.authority).toBeNull();
    expect(snapshot.online).toBeUndefined();
    expect(snapshot.session).toBeUndefined();
  });

  test("ws server adapter exposes kind, authority, topology, and url", () => {
    const snapshot = buildEditorNetworkSnapshot({
      gameId: "arena",
      multiplayer: ws({ authority: "server", url: "ws://localhost:9000/ws", topology: "lobbies" }),
    });
    expect(snapshot.adapterKind).toBe("ws");
    expect(snapshot.authority).toBe("server");
    expect(snapshot.topology).toBe("lobbies");
    expect(snapshot.endpoint).toBe("ws://localhost:9000/ws");
    expect(isNetworkMultiplayerConfigured(snapshot)).toBe(true);
  });

  test("convex presence-only is client authority without inventing a session", () => {
    const snapshot = buildEditorNetworkSnapshot({
      gameId: "city",
      multiplayer: convex({ authority: "client" }),
    });
    expect(snapshot.adapterKind).toBe("convex");
    expect(snapshot.authority).toBe("client");
    expect(snapshot.session).toBeUndefined();
    expect(snapshot.online).toBeUndefined();
  });

  test("wsPresence sugar is presence-only client", () => {
    const snapshot = buildEditorNetworkSnapshot({
      gameId: "lobby",
      multiplayer: wsPresence({ url: "wss://example/ws" }),
    });
    expect(snapshot.authority).toBe("client");
    expect(snapshot.endpoint).toBe("wss://example/ws");
  });

  test("host presence injects session + real online rows only", () => {
    const snapshot = buildEditorNetworkSnapshot({
      gameId: "arena",
      multiplayer: ws({ authority: "server", url: "ws://h/ws" }),
      presence: {
        userId: "alice",
        serverId: "srv-1",
        feedActions: ["entity.died"],
        updatedAt: 1_700_000_000_000,
        online: [
          {
            userId: "bob",
            position: { x: 1, y: 0, z: 2 },
            rotationY: 0.5,
            rotationPitch: 0.1,
            lastSeenAt: 1_700_000_000_100,
          },
        ],
      },
    });
    expect(snapshot.session).toEqual({
      userId: "alice",
      serverId: "srv-1",
      feedActions: ["entity.died"],
    });
    expect(snapshot.online).toEqual([
      {
        userId: "bob",
        position: { x: 1, y: 0, z: 2 },
        rotationY: 0.5,
        rotationPitch: 0.1,
        lastSeenAt: 1_700_000_000_100,
      },
    ]);
    expect(snapshot.updatedAt).toBe(1_700_000_000_000);
  });

  test("empty online array is preserved (connected, zero players)", () => {
    const snapshot = buildEditorNetworkSnapshot({
      gameId: "arena",
      multiplayer: ws({ authority: "server" }),
      presence: { userId: "alice", online: [] },
    });
    expect(snapshot.session?.userId).toBe("alice");
    expect(snapshot.online).toEqual([]);
  });

  test("presence without userId does not invent a session", () => {
    const snapshot = buildEditorNetworkSnapshot({
      gameId: "arena",
      multiplayer: ws({ authority: "server" }),
      presence: { online: [] },
    });
    expect(snapshot.session).toBeUndefined();
    expect(snapshot.online).toEqual([]);
  });
});
