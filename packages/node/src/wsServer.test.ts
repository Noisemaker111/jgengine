import { expect, test } from "bun:test";
import { createServer } from "node:http";

import type { RuntimePlayerRow, RuntimeServerRow } from "@jgengine/core/runtime/snapshot";
import type { GameRuntimeFeedView, GameRuntimeServerView } from "@jgengine/core/runtime/transport";
import type { ChatMessage } from "@jgengine/core/game/chat";
import { createWsBackend, type WsBackend } from "@jgengine/ws/createWsBackend";
import type { WsChatMessage, WsPresenceRow } from "@jgengine/ws/protocol";

import { createGameHost, type GameHost } from "./host";
import { memoryPersistence } from "./persistence";
import { createTestRuntime } from "./testFixtures";
import { createGameWsServer, type GameWsServer } from "./wsServer";

function channel<T>() {
  const queue: T[] = [];
  const waiters: ((value: T) => void)[] = [];
  return {
    push: (value: T) => {
      const waiter = waiters.shift();
      if (waiter) waiter(value);
      else queue.push(value);
    },
    next: (timeoutMs = 2_000): Promise<T> => {
      if (queue.length > 0) return Promise.resolve(queue.shift() as T);
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out waiting for message")), timeoutMs);
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
  };
}

async function startStack(): Promise<{
  host: GameHost;
  server: GameWsServer;
  url: string;
  backends: WsBackend[];
  connect: (userId: string) => WsBackend;
  shutdown: () => Promise<void>;
}> {
  const host = createGameHost({ runtimes: [createTestRuntime()], persistence: memoryPersistence() });
  const server = createGameWsServer({ host, port: 0 });
  await new Promise<void>((resolve) => server.wss.once("listening", resolve));
  const url = `ws://127.0.0.1:${server.port()}`;
  const backends: WsBackend[] = [];
  return {
    host,
    server,
    url,
    backends,
    connect: (userId: string) => {
      const backend = createWsBackend({
        url,
        userId,
        poseTuning: {
          minIntervalMs: 0,
          heartbeatMs: 60_000,
          positionEpsilon: 0.001,
          verticalEpsilon: 0.001,
          rotationEpsilon: 0.001,
        },
      });
      backends.push(backend);
      return backend;
    },
    shutdown: async () => {
      for (const backend of backends) backend.close();
      await server.close();
      await host.stop();
    },
  };
}

test("ws backend joins, runs commands, and receives server + player pushes", async () => {
  const stack = await startStack();
  try {
    const alice = stack.connect("alice");
    const joined = await alice.transport.joinServer({ gameId: "test-game" });
    expect(joined.isNew).toBe(true);

    const serverUpdates = channel<GameRuntimeServerView | null>();
    const playerUpdates = channel<unknown>();
    alice.feeds?.subscribeServer(joined.serverId, (view) => serverUpdates.push(view));
    alice.feeds?.subscribePlayer({ serverId: joined.serverId }, (view) => playerUpdates.push(view));

    const initial = await serverUpdates.next();
    expect(initial?.serverId).toBe(joined.serverId);
    expect(initial?.memberUserIds).toEqual(["alice"]);
    await playerUpdates.next();

    const result = await alice.transport.runCommand({
      serverId: joined.serverId,
      command: "gold.grant",
      input: { userId: "alice", amount: 7 },
    });
    expect(result).toEqual({ ok: true });

    const afterCommand = await serverUpdates.next();
    expect(afterCommand !== null && afterCommand.revision > (initial?.revision ?? 0)).toBe(true);
    const session = (afterCommand?.serverState as RuntimeServerRow).session;
    expect(Array.isArray(session.leaderboardPending)).toBe(true);

    const playerAfter = (await playerUpdates.next()) as { playerState: RuntimePlayerRow } | null;
    expect(playerAfter?.playerState.economy.gold).toBe(7);

    const rejected = await alice.transport.runCommand({
      serverId: joined.serverId,
      command: "gold.grant",
      input: { amount: "lots" },
    });
    expect(rejected.ok).toBe(false);
  } finally {
    await stack.shutdown();
  }
});

test("membership gates commands from other connections", async () => {
  const stack = await startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });

    const mallory = stack.connect("mallory");
    const result = await mallory.transport.runCommand({
      serverId,
      command: "gold.grant",
      input: { userId: "mallory", amount: 999 },
    });
    expect(result).toEqual({ ok: false, reason: "Not a member of this server" });
  } finally {
    await stack.shutdown();
  }
});

test("feed pushes fan out to subscribed members", async () => {
  const stack = await startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const feedUpdates = channel<GameRuntimeFeedView>();
    bob.feeds?.subscribeFeed({ serverId, action: "kill" }, (view) => feedUpdates.push(view));
    const empty = await feedUpdates.next();
    expect(empty).toEqual({ action: "kill", entries: [] });

    await alice.pushFeedEntry({ serverId, action: "kill", entry: { who: "hogger", by: "alice" } });
    const update = await feedUpdates.next();
    expect(update.entries).toEqual([{ who: "hogger", by: "alice" }]);
  } finally {
    await stack.shutdown();
  }
});

test("mounts on an existing http server at a path", async () => {
  const host = createGameHost({ runtimes: [createTestRuntime()], persistence: memoryPersistence() });
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const wsServer = createGameWsServer({ host, server: httpServer, path: "/ws" });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  const backend = createWsBackend({ url: `ws://127.0.0.1:${port}/ws`, userId: "alice" });
  try {
    const joined = await backend.transport.joinServer({ gameId: "test-game" });
    expect(joined.isNew).toBe(true);

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(await health.json()).toEqual({ ok: true });
  } finally {
    backend.close();
    await wsServer.close();
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await host.stop();
  }
});

test("presence poses broadcast to subscribers and clamp teleports", async () => {
  const stack = await startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const rosters = channel<WsPresenceRow[]>();
    bob.presenceSync.subscribe(serverId, (rows) => rosters.push(rows));
    expect(await rosters.next()).toEqual([]);

    alice.presenceSync.syncPose(serverId, { x: 1, y: 0, z: 2, rotationY: 0.4, rotationPitch: 0 });
    const first = await rosters.next();
    expect(first).toHaveLength(1);
    expect(first[0]?.userId).toBe("alice");
    expect(first[0]?.position.x).toBeCloseTo(1);

    alice.presenceSync.syncPose(serverId, { x: 1_000, y: 0, z: 2, rotationY: 0.4, rotationPitch: 0 });
    const clamped = await rosters.next();
    expect(clamped[0]!.position.x).toBeLessThan(100);
    expect(clamped[0]!.position.x).toBeGreaterThan(1);

    alice.close();
    const afterDisconnect = await rosters.next();
    expect(afterDisconnect).toEqual([]);
  } finally {
    await stack.shutdown();
  }
});

test("chat sends relay to channel subscribers and replay history to late joiners", async () => {
  const stack = await startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const bobFeed = channel<WsChatMessage[]>();
    bob.chatSync.subscribe(serverId, "global", (messages) => bobFeed.push(messages));
    expect(await bobFeed.next()).toEqual([]);

    expect(await alice.chatSync.send(serverId, "global", "  hello bob  ")).toEqual({ ok: true });
    const update = await bobFeed.next();
    expect(update).toHaveLength(1);
    expect(update[0]!.fromUserId).toBe("alice");
    expect(update[0]!.body).toBe("hello bob");

    expect(await alice.chatSync.send(serverId, "global", "   ")).toEqual({
      ok: false,
      reason: "empty message",
    });
    expect(await alice.chatSync.send(serverId, "global", "x".repeat(501))).toEqual({
      ok: false,
      reason: "message too long",
    });

    await alice.chatSync.send(serverId, "party", "party only");
    await expect(bobFeed.next(200)).rejects.toThrow("timed out waiting for message");

    const carol = stack.connect("carol");
    await carol.transport.joinServer({ gameId: "test-game", serverId });
    const carolFeed = channel<readonly ChatMessage[]>();
    carol.chatSyncFor(serverId).subscribe("global", (messages) => carolFeed.push(messages));
    const history = await carolFeed.next();
    expect(history.map((message) => message.body)).toEqual(["hello bob"]);
  } finally {
    await stack.shutdown();
  }
});

test("matchmaking: create private coded lobby, browse public, join by code over ws", async () => {
  const stack = await startStack();
  try {
    const host = stack.connect("host");
    const publicJoin = await host.createSession({
      gameId: "test-game",
      attributes: { visibility: "public", mode: "ranked", label: "Open Ranked" },
    });
    const privateJoin = await host.createSession({
      gameId: "test-game",
      attributes: { visibility: "private", joinCode: "COVE-77" },
    });

    const listings = await host.browse({ gameId: "test-game" });
    expect(listings.map((l) => l.serverId)).toEqual([publicJoin.serverId]);

    const friend = stack.connect("friend");
    const missed = await friend.joinByCode({ gameId: "test-game", code: "WRONG" });
    expect(missed).toBeNull();
    const landed = await friend.joinByCode({ gameId: "test-game", code: "cove 77" });
    expect(landed!.serverId).toBe(privateJoin.serverId);
  } finally {
    await stack.shutdown();
  }
});

test("lag comp: the ws host retains presence history and rewinds to an interpolated position", async () => {
  let clock = 0;
  const host = createGameHost({ runtimes: [createTestRuntime()], persistence: memoryPersistence() });
  const server = createGameWsServer({
    host,
    port: 0,
    now: () => clock,
    poseRules: {
      maxSpeed: 1_000_000,
      maxVerticalOffset: 1_000,
      minElapsedSec: 0.001,
      maxElapsedSec: 1,
      keepAliveRefreshMs: 10_000,
    },
  });
  await new Promise<void>((resolve) => server.wss.once("listening", resolve));
  const url = `ws://127.0.0.1:${server.port()}`;
  const alice = createWsBackend({
    url,
    userId: "alice",
    poseTuning: { minIntervalMs: 0, heartbeatMs: 60_000, positionEpsilon: 0.001, verticalEpsilon: 0.001, rotationEpsilon: 0.001 },
  });
  try {
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const rosters = channel<WsPresenceRow[]>();
    alice.presenceSync.subscribe(serverId, (rows) => rosters.push(rows));
    await rosters.next();

    clock = 1_000;
    alice.presenceSync.syncPose(serverId, { x: 0, y: 0, z: 0, rotationY: 0, rotationPitch: 0 });
    await rosters.next();

    clock = 1_100;
    alice.presenceSync.syncPose(serverId, { x: 4, y: 0, z: 0, rotationY: 0, rotationPitch: 0 });
    await rosters.next();

    const rewound = server.rewind({ serverId, atMs: 1_050 });
    expect(rewound).toHaveLength(1);
    expect(rewound[0]!.userId).toBe("alice");
    expect(rewound[0]!.x).toBeCloseTo(2);

    expect(server.rewind({ serverId: "missing", atMs: 1_050 })).toEqual([]);
  } finally {
    alice.close();
    await server.close();
    await host.stop();
  }
});
