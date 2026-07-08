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

function startStack(): {
  host: GameHost;
  router: HostRouter;
  backends: WsBackend[];
  connect: (userId: string) => WsBackend;
  shutdown: () => Promise<void>;
} {
  const host = createGameHost({ persistence: memoryPersistence() });
  const router = createHostRouter({ host });
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
