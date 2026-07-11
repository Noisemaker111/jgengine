import { expect, test } from "bun:test";

import { createGameHost, memoryPersistence, type GameHost } from "./host";
import { createHostRouter, loopbackPipe, type HostRouter } from "./hostRouter";
import { createWsBackend, type WsBackend } from "./createWsBackend";
import type { WsChatMessage, WsPresenceRow } from "./protocol";

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

function startStack(options: {
  allowAnonymous?: boolean;
  authenticate?: (args: { userId: string; token?: string }) => string | null;
  allowedFeedActions?: readonly string[];
  singleSession?: boolean;
} = {}): {
  host: GameHost;
  router: HostRouter;
  backends: WsBackend[];
  connect: (userId: string) => WsBackend;
  shutdown: () => Promise<void>;
} {
  const host = createGameHost({
    persistence: memoryPersistence(),
    allowedFeedActions: options.allowedFeedActions,
  });
  const router = createHostRouter({
    host,
    allowAnonymous: options.allowAnonymous ?? true,
    authenticate: options.authenticate,
    singleSession: options.singleSession,
  });
  const backends: WsBackend[] = [];
  return {
    host,
    router,
    backends,
    connect: (userId: string) => {
      const backend = createWsBackend({ userId, pipe: loopbackPipe(router) });
      backends.push(backend);
      return backend;
    },
    shutdown: async () => {
      for (const backend of backends) backend.close();
      router.close();
      await host.stop();
    },
  };
}

test("loopback: second client joins the first client's server", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const joined = await alice.transport.joinServer({ gameId: "test-game" });
    expect(joined.isNew).toBe(true);

    const bob = stack.connect("bob");
    const rejoined = await bob.transport.joinServer({ gameId: "test-game", serverId: joined.serverId });
    expect(rejoined.serverId).toBe(joined.serverId);
    expect(rejoined.isNew).toBe(true);
  } finally {
    await stack.shutdown();
  }
});

test("loopback: engine.ping command replies ok", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const result = await alice.transport.runCommand({ serverId, command: "engine.ping", input: null });
    expect(result).toEqual({ ok: true });
  } finally {
    await stack.shutdown();
  }
});

test("loopback: chat sent by one client is received by another", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const bobMessages = channel<WsChatMessage[]>();
    bob.chatSync.subscribe(serverId, "global", (messages) => bobMessages.push(messages));
    expect(await bobMessages.next()).toEqual([]);

    expect(await alice.chatSync.send(serverId, "global", "hi bob")).toEqual({ ok: true });
    const update = await bobMessages.next();
    expect(update).toHaveLength(1);
    const [message] = update;
    expect(message?.fromUserId).toBe("alice");
    expect(message?.body).toBe("hi bob");
  } finally {
    await stack.shutdown();
  }
});

test("loopback: presence pose from one client shows up for another", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const rosters = channel<WsPresenceRow[]>();
    bob.presenceSync.subscribe(serverId, (rows) => rosters.push(rows));
    expect(await rosters.next()).toEqual([]);

    alice.presenceSync.syncPose(serverId, { x: 1, y: 0, z: 2, rotationY: 0.4, rotationPitch: 0 });
    const rows = await rosters.next();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.userId).toBe("alice");
    expect(row?.position.x).toBeCloseTo(1);
  } finally {
    await stack.shutdown();
  }
});

test("loopback: presence appearance from one client reaches another", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const rosters = channel<WsPresenceRow[]>();
    bob.presenceSync.subscribe(serverId, (rows) => rosters.push(rows));
    expect(await rosters.next()).toEqual([]);

    alice.presenceSync.syncPose(serverId, {
      x: 1,
      y: 0,
      z: 2,
      rotationY: 0.4,
      rotationPitch: 0,
      appearance: { skin: "gold", mounted: true },
    });
    const rows = await rosters.next();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.appearance).toEqual({ skin: "gold", mounted: true });
  } finally {
    await stack.shutdown();
  }
});

test("loopback: presence row has no appearance when the client never sent one", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const rosters = channel<WsPresenceRow[]>();
    bob.presenceSync.subscribe(serverId, (rows) => rosters.push(rows));
    expect(await rosters.next()).toEqual([]);

    alice.presenceSync.syncPose(serverId, { x: 1, y: 0, z: 2, rotationY: 0.4, rotationPitch: 0 });
    const rows = await rosters.next();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.appearance).toBeUndefined();
  } finally {
    await stack.shutdown();
  }
});

test("loopback: leaving drops the leaver's presence row for other clients", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const rosters = channel<WsPresenceRow[]>();
    bob.presenceSync.subscribe(serverId, (rows) => rosters.push(rows));
    expect(await rosters.next()).toEqual([]);

    alice.presenceSync.syncPose(serverId, { x: 1, y: 0, z: 2, rotationY: 0.4, rotationPitch: 0 });
    expect(await rosters.next()).toHaveLength(1);

    await alice.transport.leaveServer({ serverId });
    expect(await rosters.next()).toEqual([]);
  } finally {
    await stack.shutdown();
  }
});

test("loopback: feed subscription fires when membership changes", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });

    const serverUpdates = channel<{ memberUserIds: string[] } | null>();
    alice.feeds?.subscribeServer(serverId, (view) =>
      serverUpdates.push(view as { memberUserIds: string[] } | null),
    );
    const initial = await serverUpdates.next();
    expect(initial?.memberUserIds).toEqual(["alice"]);

    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });
    const afterJoin = await serverUpdates.next();
    expect(afterJoin?.memberUserIds).toEqual(["alice", "bob"]);
  } finally {
    await stack.shutdown();
  }
});

test("loopback: commands are unreachable before the automatic hello completes membership checks", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });

    const mallory = stack.connect("mallory");
    const result = await mallory.transport.runCommand({ serverId, command: "engine.ping", input: null });
    expect(result).toEqual({ ok: false, reason: "Not a member of this server" });
  } finally {
    await stack.shutdown();
  }
});

test("loopback: unknown serverId on join fails closed", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    await expect(
      alice.transport.joinServer({ gameId: "test-game", serverId: "srv-does-not-exist" }),
    ).rejects.toThrow("Server not found");
  } finally {
    await stack.shutdown();
  }
});

test("loopback: createSession without serverId still creates a new server", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const created = await alice.createSession({ gameId: "test-game" });
    expect(created.serverId.length).toBeGreaterThan(0);
    expect(created.isNew).toBe(true);
  } finally {
    await stack.shutdown();
  }
});

test("loopback: disconnect leaves the server and reclaims the slot", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });

    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const serverUpdates = channel<{ memberUserIds: string[] } | null>();
    bob.feeds?.subscribeServer(serverId, (view) =>
      serverUpdates.push(view as { memberUserIds: string[] } | null),
    );
    expect((await serverUpdates.next())?.memberUserIds.sort()).toEqual(["alice", "bob"]);

    alice.close();
    const afterDisconnect = await serverUpdates.next();
    expect(afterDisconnect?.memberUserIds).toEqual(["bob"]);

    const carol = stack.connect("carol");
    const rejoined = await carol.transport.joinServer({ gameId: "test-game", serverId });
    expect(rejoined.serverId).toBe(serverId);
  } finally {
    await stack.shutdown();
  }
});

test("loopback: decode failure with id replies an error instead of hanging", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const router = createHostRouter({ host });
  try {
    const replies = channel<string>();
    const connection = router.connect({
      send: (data) => replies.push(data),
      close: () => undefined,
    });
    connection.handleRaw(JSON.stringify({ v: 2, t: "hello", id: 42, userId: "alice" }));
    const raw = await replies.next();
    const message = JSON.parse(raw) as { t: string; id: number; ok: boolean; reason: string };
    expect(message).toEqual({
      v: 1,
      t: "reply",
      id: 42,
      ok: false,
      reason: "Protocol version mismatch",
    });
    connection.close();
  } finally {
    router.close();
    await host.stop();
  }
});

test("loopback: concurrent frames on one socket are serialized", async () => {
  let active = 0;
  let maxActive = 0;
  const host = createGameHost({ persistence: memoryPersistence() });
  const router = createHostRouter({
    host,
    authenticate: async ({ userId }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
      return userId;
    },
  });
  try {
    const replies = channel<string>();
    const connection = router.connect({
      send: (data) => replies.push(data),
      close: () => undefined,
    });
    connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "alice" }));
    connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 2, userId: "alice" }));
    const first = JSON.parse(await replies.next()) as { id: number; ok: boolean };
    const second = JSON.parse(await replies.next()) as { id: number; ok: boolean; reason?: string };
    expect(first).toEqual({ v: 1, t: "reply", id: 1, ok: true, result: { userId: "alice" } });
    expect(second).toEqual({ v: 1, t: "reply", id: 2, ok: false, reason: "Already authenticated" });
    expect(maxActive).toBe(1);
    connection.close();
  } finally {
    router.close();
    await host.stop();
  }
});

test("security: anonymous hello rejected without allowAnonymous or authenticate", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const router = createHostRouter({ host });
  const backend = createWsBackend({ userId: "mallory", pipe: loopbackPipe(router) });
  try {
    await expect(backend.transport.joinServer({ gameId: "test-game" })).rejects.toThrow();
  } finally {
    backend.close();
    router.close();
    await host.stop();
  }
});

test("security: second hello on a live connection is rejected", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const router = createHostRouter({ host, allowAnonymous: true });
  const replies = channel<unknown>();
  const connection = router.connect({
    send: (data) => replies.push(JSON.parse(data)),
    close: () => undefined,
  });
  try {
    connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "alice" }));
    expect(await replies.next()).toMatchObject({ t: "reply", id: 1, ok: true });
    connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 2, userId: "bob" }));
    expect(await replies.next()).toMatchObject({ t: "reply", id: 2, ok: false, reason: "Already authenticated" });
  } finally {
    connection.close();
    router.close();
    await host.stop();
  }
});

test("security: single-session lock evicts the older connection for the same userId", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const router = createHostRouter({ host, allowAnonymous: true, singleSession: true });
  const closed: string[] = [];
  const makeConn = (label: string) => {
    const replies = channel<unknown>();
    const connection = router.connect({
      send: (data) => replies.push(JSON.parse(data)),
      close: () => closed.push(label),
    });
    return { connection, replies };
  };
  const first = makeConn("first");
  const second = makeConn("second");
  try {
    first.connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "alice" }));
    expect(await first.replies.next()).toMatchObject({ t: "reply", id: 1, ok: true, result: { userId: "alice" } });
    second.connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "alice" }));
    expect(await second.replies.next()).toMatchObject({ t: "reply", id: 1, ok: true, result: { userId: "alice" } });
    expect(closed).toContain("first");
  } finally {
    first.connection.close();
    second.connection.close();
    router.close();
    await host.stop();
  }
});

test("security: pose chat and voice reject cross-room non-members", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const mallory = stack.connect("mallory");
    await mallory.transport.joinServer({ gameId: "other-game" });

    const chat = await mallory.chatSync.send(serverId, "global", "pwn");
    expect(chat).toEqual({ ok: false, reason: "Not a member of this server" });

    await expect(mallory.voiceSync.join(serverId, "proximity")).rejects.toThrow(
      /Not a member of this server/,
    );

    const rosters = channel<WsPresenceRow[]>();
    alice.presenceSync.subscribe(serverId, (rows) => rosters.push(rows));
    expect(await rosters.next()).toEqual([]);
    mallory.presenceSync.syncPose(serverId, { x: 99, y: 0, z: 99, rotationY: 0, rotationPitch: 0 });
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    alice.presenceSync.syncPose(serverId, { x: 1, y: 0, z: 1, rotationY: 0, rotationPitch: 0 });
    const rows = await rosters.next();
    expect(rows.every((row) => row.userId !== "mallory")).toBe(true);
  } finally {
    await stack.shutdown();
  }
});

test("security: client feed writes require an allowlist", async () => {
  const stack = startStack({ allowedFeedActions: ["kill"] });
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    await expect(
      alice.pushFeedEntry({ serverId, action: "loot.forge", entry: { gold: 999 } }),
    ).rejects.toThrow(/feed action not allowed/);
    await alice.pushFeedEntry({ serverId, action: "kill", entry: { who: "hogger" } });
  } finally {
    await stack.shutdown();
  }
});

test("security: client feed writes disabled by default", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    await expect(
      alice.pushFeedEntry({ serverId, action: "kill", entry: { who: "hogger" } }),
    ).rejects.toThrow(/client feed writes are disabled/);
  } finally {
    await stack.shutdown();
  }
});
