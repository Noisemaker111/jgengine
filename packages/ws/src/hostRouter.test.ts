import { expect, test } from "bun:test";

import type { CommandAuthorize, CommandCatalog, CommandLimits } from "./commandMiddleware";
import { createGameHost, memoryPersistence, type GameHost, type HostChangeEvent } from "./host";
import { createHostRouter, loopbackPipe, MAX_QUEUED_MESSAGES, type HostRouter } from "./hostRouter";
import { createWsBackend, type WsBackend } from "./createWsBackend";
import type { WsChatMessage, WsPresenceRow, WsServerMessage } from "./protocol";
import type { WorldSyncFrame } from "@jgengine/core/runtime/transport";

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
  limits?: CommandLimits;
  authorize?: CommandAuthorize;
  validate?: CommandCatalog;
  graceMs?: number;
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
    limits: options.limits,
    authorize: options.authorize,
    validate: options.validate,
    graceMs: options.graceMs,
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

async function delayedWorldStack() {
  const host = createGameHost({ persistence: memoryPersistence() });
  let notify: (event: HostChangeEvent) => void = () => {};
  host.subscribe = (listener) => { notify = listener; return () => {}; };
  const pulls = channel<{
    sinceRevision: number | null;
    resolve: (frame: WorldSyncFrame) => void;
    reject: (error: Error) => void;
  }>();
  const cursors: (number | null)[] = [];
  let onPull: () => void = () => {};
  host.pullWorld = ({ sinceRevision }) => new Promise((resolve, reject) => {
    cursors.push(sinceRevision);
    pulls.push({ sinceRevision, resolve, reject });
    onPull();
  });
  const router = createHostRouter({ host, allowAnonymous: true, graceMs: 0 });
  const replies = channel<WsServerMessage>();
  const updates = channel<WorldSyncFrame>();
  const sent: WorldSyncFrame[] = [];
  let onFrame: () => void = () => {};
  const connection = router.connect({
    send: (raw) => {
      const message = JSON.parse(raw) as WsServerMessage;
      if (message.t === "reply" || message.t === "pong") replies.push(message);
      if (message.t === "update" && message.channel === "server") {
        const frame = (message.data as { serverState: WorldSyncFrame }).serverState;
        sent.push(frame);
        updates.push(frame);
        onFrame();
      }
    },
    close: () => {},
  });
  let id = 0;
  const request = async (message: Record<string, unknown>) => {
    connection.handleRaw(JSON.stringify({ v: 1, id: ++id, ...message }));
    return replies.next();
  };
  await request({ t: "hello", userId: "alice" });
  const joined = await request({ t: "join", gameId: "test-game" });
  if (joined.t !== "reply" || !joined.ok) throw new Error("join failed");
  const serverId = (joined.result as { serverId: string }).serverId;
  return {
    host, router, connection, pulls, cursors, updates, sent, serverId,
    subscribe: () => request({ t: "subscribe", channel: "server", serverId }),
    unsubscribe: () => request({ t: "unsubscribe", channel: "server", serverId }),
    flush: () => request({ t: "ping", at: 0 }),
    notify: () => notify({ type: "server", serverId }),
    onFrame: (callback: () => void) => { onFrame = callback; },
    onPull: (callback: () => void) => { onPull = callback; },
    shutdown: async () => { connection.close(); router.close(); await host.stop(); },
  };
}

function worldBaseline(revision: number): WorldSyncFrame {
  return { kind: "baseline", revision, snapshot: { entities: [] } };
}

test("router close fences deferred authentication, queued joins, and new connections", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  let began!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let joins = 0;
  const join = host.joinServer;
  host.joinServer = args => { joins += 1; return join(args); };
  const router = createHostRouter({ host, authenticate: async () => { began(); await gate; return "alice"; } });
  const replies: unknown[] = [];
  const connection = router.connect({ send: raw => replies.push(JSON.parse(raw)), close: () => {} });
  connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "alice" }));
  await started;
  connection.handleRaw(JSON.stringify({ v: 1, t: "join", id: 2, gameId: "test" }));
  router.close();
  let settled = false;
  const draining = router.drain().then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(() => router.connect({ send: () => {}, close: () => {} })).toThrow("closed");
  release(); await draining;
  expect(joins).toBe(0);
  expect(replies).toEqual([]);
  connection.close(); router.close();
  await host.stop();
});

test("server replication coalesces a slow subscriber's event burst and advances its cursor in order", async () => {
  const stack = await delayedWorldStack();
  try {
    expect(await stack.subscribe()).toMatchObject({ t: "reply", ok: true });
    const first = await stack.pulls.next();
    for (let index = 0; index < 10_000; index += 1) stack.notify();
    await stack.flush();
    expect(stack.cursors).toEqual([null]);
    first.resolve(worldBaseline(1));
    expect((await stack.updates.next()).revision).toBe(1);
    const second = await stack.pulls.next();
    expect(second.sinceRevision).toBe(1);
    second.resolve(worldBaseline(10_001));
    expect((await stack.updates.next()).revision).toBe(10_001);
    await stack.flush();
    expect(stack.cursors).toEqual([null, 1]);
    expect(stack.sent.map((frame) => frame.revision)).toEqual([1, 10_001]);
  } finally {
    await stack.shutdown();
  }
});

test("server replication keeps one slow read across unsubscribe and resubscribe bursts", async () => {
  const stack = await delayedWorldStack();
  try {
    await stack.subscribe();
    const obsolete = await stack.pulls.next();
    for (let index = 0; index < 20; index += 1) {
      await stack.unsubscribe();
      await stack.subscribe();
      stack.notify();
    }
    expect(stack.cursors).toEqual([null]);
    obsolete.resolve(worldBaseline(1));
    const current = await stack.pulls.next();
    expect(current.sinceRevision).toBeNull();
    expect(stack.sent).toEqual([]);
    current.resolve(worldBaseline(2));
    expect((await stack.updates.next()).revision).toBe(2);
    await stack.flush();
    expect(stack.cursors).toEqual([null, null]);
  } finally {
    await stack.shutdown();
  }
});

test("server replication does not lose a notification queued while its drain settles", async () => {
  const stack = await delayedWorldStack();
  try {
    stack.onFrame(() => {
      stack.onFrame(() => {});
      queueMicrotask(() => queueMicrotask(stack.notify));
    });
    await stack.subscribe();
    (await stack.pulls.next()).resolve(worldBaseline(1));
    expect((await stack.updates.next()).revision).toBe(1);
    const next = await stack.pulls.next();
    expect(next.sinceRevision).toBe(1);
    next.resolve(worldBaseline(2));
    expect((await stack.updates.next()).revision).toBe(2);
    await stack.flush();
    expect(stack.cursors).toEqual([null, 1]);
  } finally {
    await stack.shutdown();
  }
});

test("server replication stays single-flight when a world read emits a notification synchronously", async () => {
  const stack = await delayedWorldStack();
  try {
    stack.onPull(() => {
      stack.onPull(() => {});
      stack.notify();
    });
    await stack.subscribe();
    const first = await stack.pulls.next();
    await stack.flush();
    expect(stack.cursors).toEqual([null]);
    first.resolve(worldBaseline(1));
    await stack.updates.next();
    const second = await stack.pulls.next();
    expect(second.sinceRevision).toBe(1);
    second.resolve(worldBaseline(2));
    await stack.updates.next();
    expect(stack.cursors).toEqual([null, 1]);
  } finally {
    await stack.shutdown();
  }
});

test("server replication discards in-flight results after unsubscribe or connection close", async () => {
  for (const close of [false, true]) {
    const stack = await delayedWorldStack();
    try {
      await stack.subscribe();
      const pending = await stack.pulls.next();
      stack.notify();
      if (close) stack.connection.close();
      else await stack.unsubscribe();
      pending.resolve(worldBaseline(1));
      await Promise.resolve();
      await Promise.resolve();
      expect(stack.sent).toEqual([]);
      expect(stack.cursors).toEqual([null]);
    } finally {
      await stack.shutdown();
    }
  }
});

test("server replication honors a baseline request while an older diff is in flight", async () => {
  const stack = await delayedWorldStack();
  try {
    await stack.subscribe();
    (await stack.pulls.next()).resolve(worldBaseline(1));
    await stack.updates.next();
    stack.notify();
    const obsolete = await stack.pulls.next();
    expect(obsolete.sinceRevision).toBe(1);
    await stack.subscribe();
    obsolete.resolve(worldBaseline(2));
    const baseline = await stack.pulls.next();
    expect(baseline.sinceRevision).toBeNull();
    baseline.resolve(worldBaseline(3));
    expect((await stack.updates.next()).revision).toBe(3);
    expect(stack.sent.map((frame) => frame.revision)).toEqual([1, 3]);
  } finally {
    await stack.shutdown();
  }
});

test("server replication retries rejected reads without advancing past unsent frames", async () => {
  const stack = await delayedWorldStack();
  try {
    await stack.subscribe();
    (await stack.pulls.next()).reject(new Error("temporary world read failure"));
    await stack.flush();
    stack.notify();
    const retry = await stack.pulls.next();
    expect(retry.sinceRevision).toBeNull();
    const getServerView = stack.host.getServerView;
    stack.host.getServerView = async () => { throw new Error("temporary metadata failure"); };
    retry.resolve(worldBaseline(1));
    await stack.flush();
    stack.host.getServerView = getServerView;
    stack.notify();
    const retryMetadata = await stack.pulls.next();
    expect(retryMetadata.sinceRevision).toBeNull();
    retryMetadata.resolve(worldBaseline(2));
    expect((await stack.updates.next()).revision).toBe(2);
    expect(stack.sent.map((frame) => frame.revision)).toEqual([2]);
  } finally {
    await stack.shutdown();
  }
});

test("loopback: second client joins the first client's server", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const joined = await alice.transport.joinServer({ gameId: "test-game" });
    expect(joined.isNew).toBe(true);
    expect(joined.resumeTicket).toMatchObject({ userId: "alice", serverId: joined.serverId });
    expect(joined.resumeTicket?.token).toEqual(expect.any(String));

    const bob = stack.connect("bob");
    const rejoined = await bob.transport.joinServer({ gameId: "test-game", serverId: joined.serverId });
    expect(rejoined.serverId).toBe(joined.serverId);
    expect(rejoined.isNew).toBe(true);
  } finally {
    await stack.shutdown();
  }
});

test("loopback: spectators can join and receive server updates but cannot run commands or move", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const joined = await alice.transport.joinServer({ gameId: "test-game" });
    const spectator = stack.connect("spectator");
    await spectator.transport.joinServer({ gameId: "test-game", serverId: joined.serverId, role: "spectator" });
    expect(await spectator.transport.runCommand({ serverId: joined.serverId, command: "engine.ping", input: null }))
      .toEqual({ ok: false, reason: "Spectators cannot run commands" });
    const serverFeed = spectator.feeds?.subscribeServer;
    expect(serverFeed).toBeDefined();
    const updates: unknown[] = [];
    const unsubscribe = serverFeed!(joined.serverId, (view) => updates.push(view));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updates.length).toBeGreaterThan(0);
    unsubscribe();
  } finally {
    await stack.shutdown();
  }
});

test("loopback: reconnect within the grace window keeps the player entity", async () => {
  const stack = startStack({ graceMs: 50 });
  try {
    const alice = stack.connect("alice");
    const joined = await alice.transport.joinServer({ gameId: "test-game" });
    alice.close();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const reconnected = stack.connect("alice");
    const result = await reconnected.transport.runCommand({
      serverId: joined.serverId,
      command: "engine.ping",
      input: null,
    });
    expect(result).toEqual({ ok: true });
    expect(await stack.host.isMember({ userId: "alice", serverId: joined.serverId })).toBe(true);
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

test("loopback: server subscribers pull diffs and can request a baseline after a missed revision", async () => {
  const host = createGameHost({ persistence: memoryPersistence() });
  const baseline: WorldSyncFrame = {
    kind: "baseline",
    revision: 1,
    snapshot: { entities: Array.from({ length: 20 }, (_, index) => ({ id: index === 0 ? "mover" : `entity-${index}`, position: [index, 0, 0] })) },
  };
  const diff: WorldSyncFrame = {
    kind: "diff",
    revision: 2,
    diff: {
      revision: 2,
      baseRevision: 1,
      entities: [{ id: "mover", position: [1, 0, 0] }],
      removedEntities: [],
      stats: {},
      removedStats: [],
      store: [],
      removedStore: [],
      modules: {},
      removedModules: [],
    },
  };
  const resync: WorldSyncFrame = { ...baseline, revision: 3, snapshot: { entities: Array.from({ length: 20 }, (_, index) => ({ id: index === 0 ? "mover" : `entity-${index}`, position: [index + (index === 0 ? 2 : 0), 0, 0] })) } };
  const cursors: (number | null)[] = [];
  host.pullWorld = async ({ sinceRevision }) => {
    cursors.push(sinceRevision);
    return sinceRevision === null ? baseline : sinceRevision === 1 ? diff : resync;
  };
  const router = createHostRouter({ host, allowAnonymous: true });
  const backend = createWsBackend({ userId: "alice", pipe: loopbackPipe(router) });
  try {
    const { serverId } = await backend.transport.joinServer({ gameId: "test-game" });
    const updates = channel<unknown>();
    const unsubscribe = backend.feeds?.subscribeServer(serverId, (view) => updates.push(view?.serverState));
    const first = await updates.next();
    expect((first as WorldSyncFrame).kind).toBe("baseline");
    expect(JSON.stringify(diff).length).toBeLessThan(JSON.stringify(baseline).length);

    await host.runCommand({ userId: "alice", serverId, command: "engine.ping", input: null });
    expect((await updates.next() as WorldSyncFrame).kind).toBe("diff");
    backend.feeds?.requestServerBaseline?.(serverId);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await updates.next() as WorldSyncFrame).kind).toBe("baseline");
    await host.runCommand({ userId: "alice", serverId, command: "engine.ping", input: null });
    expect((await updates.next() as WorldSyncFrame).kind).toBe("diff");
    expect(cursors).toEqual([null, 1, null, 1]);
    unsubscribe?.();
  } finally {
    backend.close();
    router.close();
    await host.stop();
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

test("loopback: a presence broadcast for one room reaches only that room's subscribers", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const roomX = await alice.transport.joinServer({ gameId: "room-x" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "room-x", serverId: roomX.serverId });

    const carol = stack.connect("carol");
    const roomY = await carol.transport.joinServer({ gameId: "room-y" });
    expect(roomY.serverId).not.toBe(roomX.serverId);

    const bobRooms = channel<WsPresenceRow[]>();
    bob.presenceSync.subscribe(roomX.serverId, (rows) => bobRooms.push(rows));
    expect(await bobRooms.next()).toEqual([]);

    const carolUpdates: WsPresenceRow[][] = [];
    carol.presenceSync.subscribe(roomY.serverId, (rows) => carolUpdates.push(rows));
    expect(await new Promise<WsPresenceRow[]>((r) => setTimeout(() => r(carolUpdates[0] ?? []), 20))).toEqual([]);

    alice.presenceSync.syncPose(roomX.serverId, { x: 3, y: 0, z: 0, rotationY: 0, rotationPitch: 0 });

    const bobRows = await bobRooms.next();
    expect(bobRows.map((row) => row.userId)).toEqual(["alice"]);

    await new Promise((r) => setTimeout(r, 20));
    expect(carolUpdates).toHaveLength(1);
    expect(carolUpdates[0]).toEqual([]);
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
    ).resolves.toEqual({ ok: false, reason: "closed" });
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
  const stack = startStack({ graceMs: 0 });
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

test("loopback: a flood of frames past the queue bound gets rejected instead of piling up", async () => {
  let released: (() => void) | undefined;
  const host = createGameHost({ persistence: memoryPersistence() });
  const router = createHostRouter({
    host,
    authenticate: ({ userId }) =>
      new Promise((resolve) => {
        released = () => resolve(userId);
      }),
  });
  try {
    const replies = channel<{ id: number; ok: boolean; reason?: string }>();
    const connection = router.connect({
      send: (data) => replies.push(JSON.parse(data) as { id: number; ok: boolean; reason?: string }),
      close: () => undefined,
    });
    const total = MAX_QUEUED_MESSAGES + 5;
    for (let id = 1; id <= total; id += 1) {
      connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id, userId: "alice" }));
    }
    const overflow: { id: number; ok: boolean; reason?: string }[] = [];
    for (let i = 0; i < 5; i += 1) overflow.push(await replies.next());
    for (const reply of overflow) {
      expect(reply.ok).toBe(false);
      expect(reply.reason).toBe("Too many pending requests");
    }
    expect(overflow.map((reply) => reply.id)).toEqual([
      MAX_QUEUED_MESSAGES + 1,
      MAX_QUEUED_MESSAGES + 2,
      MAX_QUEUED_MESSAGES + 3,
      MAX_QUEUED_MESSAGES + 4,
      MAX_QUEUED_MESSAGES + 5,
    ]);
    released?.();
    const first = await replies.next();
    expect(first).toMatchObject({ id: 1, ok: true });
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
    await expect(backend.transport.joinServer({ gameId: "test-game" })).resolves.toEqual({ ok: false, reason: "closed" });
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

test("security: a mid-session reconnect evicts the stale connection but keeps room membership live", async () => {
  const stack = startStack({ singleSession: true });
  try {
    const alice1 = stack.connect("alice");
    const { serverId } = await alice1.transport.joinServer({ gameId: "test-game" });
    await alice1.transport.runCommand({ serverId, command: "engine.ping", input: null });

    // A second connection for the same userId (e.g. a browser tab refresh) evicts the first
    // without the server ever seeing the player leave.
    const alice2 = stack.connect("alice");
    const pingAfterReconnect = await alice2.transport.runCommand({
      serverId,
      command: "engine.ping",
      input: null,
    });
    expect(pingAfterReconnect).toEqual({ ok: true });
    expect(await stack.host.isMember({ userId: "alice", serverId })).toBe(true);
    expect((await stack.host.getServerView({ userId: "alice", serverId }))?.memberUserIds).toEqual(["alice"]);
  } finally {
    await stack.shutdown();
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

test("middleware: an unconfigured router runs a burst of commands unthrottled", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    for (let i = 0; i < 25; i += 1) {
      const result = await alice.transport.runCommand({ serverId, command: "engine.ping", input: null });
      expect(result).toEqual({ ok: true });
    }
  } finally {
    await stack.shutdown();
  }
});

test("middleware: limits reject a runCommand burst past its configured budget", async () => {
  const stack = startStack({ limits: { runCommand: { count: 1, perMs: 60_000 } } });
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const first = await alice.transport.runCommand({ serverId, command: "engine.ping", input: null });
    expect(first).toEqual({ ok: true });
    const second = await alice.transport.runCommand({ serverId, command: "engine.ping", input: null });
    expect(second).toEqual({ ok: false, reason: "Rate limited: runCommand" });
  } finally {
    await stack.shutdown();
  }
});

test("middleware: limits are per connection, so a fresh connection keeps its own budget", async () => {
  const stack = startStack({ limits: { browse: { count: 1, perMs: 60_000 } } });
  try {
    const alice = stack.connect("alice");
    await alice.transport.joinServer({ gameId: "test-game" });
    await expect(alice.browse({ gameId: "test-game" })).resolves.toBeDefined();
    await expect(alice.browse({ gameId: "test-game" })).rejects.toThrow(/Rate limited: browse/);

    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game" });
    await expect(bob.browse({ gameId: "test-game" })).resolves.toBeDefined();
  } finally {
    await stack.shutdown();
  }
});

test("middleware: validate rejects a runCommand name absent from the declared catalog", async () => {
  const stack = startStack({ validate: { "engine.ping": {} } });
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const known = await alice.transport.runCommand({ serverId, command: "engine.ping", input: null });
    expect(known).toEqual({ ok: true });
    const unknown = await alice.transport.runCommand({ serverId, command: "engine.nope", input: null });
    expect(unknown).toEqual({ ok: false, reason: "Unknown command: engine.nope" });
  } finally {
    await stack.shutdown();
  }
});

test("middleware: validate runs a declared command's input validator before it reaches the host", async () => {
  const stack = startStack({
    validate: {
      "engine.ping": { validate: (input) => (input === null ? { reason: "input required" } : null) },
    },
  });
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const rejected = await alice.transport.runCommand({ serverId, command: "engine.ping", input: null });
    expect(rejected).toEqual({ ok: false, reason: "input required" });
    const accepted = await alice.transport.runCommand({ serverId, command: "engine.ping", input: {} });
    expect(accepted).toEqual({ ok: true });
  } finally {
    await stack.shutdown();
  }
});

test("middleware: authorize hook can gate a sensitive op while leaving others untouched", async () => {
  const stack = startStack({ authorize: ({ op }) => op !== "runCommand" });
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    await expect(
      alice.transport.runCommand({ serverId, command: "engine.ping", input: null }),
    ).resolves.toEqual({ ok: false, reason: "Not authorized: runCommand" });
    await expect(alice.browse({ gameId: "test-game" })).resolves.toBeDefined();
  } finally {
    await stack.shutdown();
  }
});

test("sessions: a disposed join's leave keeps the live session, and the last leave ends membership", async () => {
  const stack = startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game", sessionId: "mount-1" });
    await alice.transport.joinServer({ gameId: "test-game", serverId, sessionId: "mount-2" });
    await alice.transport.leaveServer({ serverId, sessionId: "mount-1" });
    expect(await stack.host.isMember({ userId: "alice", serverId })).toBe(true);
    expect(await alice.transport.runCommand({ serverId, command: "engine.ping", input: {} })).toMatchObject({ ok: true });
    await alice.transport.leaveServer({ serverId, sessionId: "mount-2" });
    expect(await stack.host.isMember({ userId: "alice", serverId })).toBe(false);
  } finally {
    await stack.shutdown();
  }
});

test("sessions: with multiple connections, one connection leaving keeps the user in the server", async () => {
  const stack = startStack({ singleSession: false, graceMs: 0 });
  try {
    const tabA = stack.connect("alice");
    const tabB = stack.connect("alice");
    const { serverId } = await tabA.transport.joinServer({ gameId: "test-game", sessionId: "a" });
    await tabB.transport.joinServer({ gameId: "test-game", serverId, sessionId: "b" });
    await tabB.transport.leaveServer({ serverId });
    expect(await stack.host.isMember({ userId: "alice", serverId })).toBe(true);
    tabA.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await stack.host.isMember({ userId: "alice", serverId })).toBe(false);
  } finally {
    await stack.shutdown();
  }
});
