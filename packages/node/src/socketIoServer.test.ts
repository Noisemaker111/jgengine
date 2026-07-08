import { expect, test } from "bun:test";

import type { GameRuntimeServerView } from "@jgengine/core/runtime/transport";
import type { WsBackend } from "@jgengine/ws/createWsBackend";
import { createSocketIoBackend, type SocketIoLikeSocket } from "@jgengine/ws/socketIoPipe";
import type { WsChatMessage, WsPresenceRow } from "@jgengine/ws/protocol";

import { createGameHost, type GameHost } from "./host";
import { memoryPersistence } from "./persistence";
import { createTestRuntime } from "./testFixtures";
import {
  attachGameSocketIoServer,
  type GameSocketIoServer,
  type SocketIoLikeServer,
  type SocketIoLikeServerSocket,
} from "./socketIoServer";

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

type Listener = (payload: string) => void;

function createEmitter() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    on: (event: string, listener: Listener) => {
      let set = listeners.get(event);
      if (set === undefined) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener);
    },
    off: (event: string, listener: Listener) => {
      listeners.get(event)?.delete(listener);
    },
    emit: (event: string, payload: string) => {
      const set = listeners.get(event);
      if (set === undefined) return;
      for (const listener of [...set]) listener(payload);
    },
  };
}

function createFakeSocketIoServer(): {
  server: SocketIoLikeServer;
  connectClient: () => SocketIoLikeSocket;
} {
  const connectionListeners: ((socket: SocketIoLikeServerSocket) => void)[] = [];

  const server: SocketIoLikeServer = {
    on: (event, listener) => {
      if (event === "connection") connectionListeners.push(listener);
      return server;
    },
  };

  const connectClient = (): SocketIoLikeSocket => {
    const clientEmitter = createEmitter();
    const serverEmitter = createEmitter();

    let clientConnected = false;
    let serverConnected = false;

    const client: SocketIoLikeSocket = {
      get connected() {
        return clientConnected;
      },
      on: (event, listener) => clientEmitter.on(event, listener),
      off: (event, listener) => clientEmitter.off(event, listener),
      send: (data) => {
        queueMicrotask(() => {
          if (!serverConnected) return;
          serverEmitter.emit("message", data);
        });
      },
      disconnect: () => {
        if (!clientConnected) return;
        clientConnected = false;
        serverConnected = false;
        queueMicrotask(() => {
          clientEmitter.emit("disconnect", "");
          serverEmitter.emit("disconnect", "");
        });
      },
    };

    const serverSocket: SocketIoLikeServerSocket = {
      on: (event, listener) => serverEmitter.on(event, listener),
      send: (data) => {
        queueMicrotask(() => {
          if (!clientConnected) return;
          clientEmitter.emit("message", data);
        });
      },
      disconnect: () => {
        if (!serverConnected) return;
        serverConnected = false;
        clientConnected = false;
        queueMicrotask(() => {
          serverEmitter.emit("disconnect", "");
          clientEmitter.emit("disconnect", "");
        });
      },
    };

    queueMicrotask(() => {
      clientConnected = true;
      serverConnected = true;
      clientEmitter.emit("connect", "");
      for (const listener of connectionListeners) listener(serverSocket);
    });

    return client;
  };

  return { server, connectClient };
}

async function startStack(): Promise<{
  host: GameHost;
  server: GameSocketIoServer;
  backends: WsBackend[];
  connect: (userId: string) => WsBackend;
  shutdown: () => Promise<void>;
}> {
  const host = createGameHost({ runtimes: [createTestRuntime()], persistence: memoryPersistence() });
  const { server: io, connectClient } = createFakeSocketIoServer();
  const server = attachGameSocketIoServer({ host, io });
  const backends: WsBackend[] = [];
  return {
    host,
    server,
    backends,
    connect: (userId: string) => {
      const socket = connectClient();
      const backend = createSocketIoBackend({
        socket,
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
      server.close();
      await host.stop();
    },
  };
}

test("socket.io backend joins a server and reports isNew", async () => {
  const stack = await startStack();
  try {
    const alice = stack.connect("alice");
    const joined = await alice.transport.joinServer({ gameId: "test-game" });
    expect(joined.isNew).toBe(true);
    expect(typeof joined.serverId).toBe("string");
  } finally {
    await stack.shutdown();
  }
});

test("socket.io backend runs commands and receives server + player feed pushes", async () => {
  const stack = await startStack();
  try {
    const alice = stack.connect("alice");
    const joined = await alice.transport.joinServer({ gameId: "test-game" });

    const serverUpdates = channel<GameRuntimeServerView | null>();
    const playerUpdates = channel<unknown>();
    alice.feeds?.subscribeServer(joined.serverId, (view) => serverUpdates.push(view));
    alice.feeds?.subscribePlayer({ serverId: joined.serverId }, (view) => playerUpdates.push(view));

    const initial = await serverUpdates.next();
    expect(initial?.serverId).toBe(joined.serverId);
    await playerUpdates.next();

    const result = await alice.transport.runCommand({
      serverId: joined.serverId,
      command: "gold.grant",
      input: { userId: "alice", amount: 5 },
    });
    expect(result).toEqual({ ok: true });

    const afterCommand = await serverUpdates.next();
    expect(afterCommand !== null && afterCommand.revision > (initial?.revision ?? 0)).toBe(true);

    const playerAfter = (await playerUpdates.next()) as { playerState: { economy: { gold: number } } } | null;
    expect(playerAfter?.playerState.economy.gold).toBe(5);
  } finally {
    await stack.shutdown();
  }
});

test("socket.io backend chat send + subscribe roundtrip", async () => {
  const stack = await startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const bobFeed = channel<WsChatMessage[]>();
    bob.chatSync.subscribe(serverId, "global", (messages) => bobFeed.push(messages));
    expect(await bobFeed.next()).toEqual([]);

    expect(await alice.chatSync.send(serverId, "global", "hi bob")).toEqual({ ok: true });
    const update = await bobFeed.next();
    expect(update).toHaveLength(1);
    expect(update[0]!.fromUserId).toBe("alice");
    expect(update[0]!.body).toBe("hi bob");
  } finally {
    await stack.shutdown();
  }
});

test("socket.io backend presence broadcasts between two connected clients", async () => {
  const stack = await startStack();
  try {
    const alice = stack.connect("alice");
    const { serverId } = await alice.transport.joinServer({ gameId: "test-game" });
    const bob = stack.connect("bob");
    await bob.transport.joinServer({ gameId: "test-game", serverId });

    const bobRosters = channel<WsPresenceRow[]>();
    bob.presenceSync.subscribe(serverId, (rows) => bobRosters.push(rows));
    expect(await bobRosters.next()).toEqual([]);

    alice.presenceSync.syncPose(serverId, { x: 1, y: 0, z: 2, rotationY: 0.4, rotationPitch: 0 });
    const afterAlice = await bobRosters.next();
    expect(afterAlice).toHaveLength(1);
    expect(afterAlice[0]?.userId).toBe("alice");

    const aliceRosters = channel<WsPresenceRow[]>();
    alice.presenceSync.subscribe(serverId, (rows) => aliceRosters.push(rows));
    await aliceRosters.next();

    bob.presenceSync.syncPose(serverId, { x: 3, y: 0, z: 4, rotationY: 0, rotationPitch: 0 });
    const afterBob = await aliceRosters.next();
    expect(afterBob.map((row) => row.userId).sort()).toEqual(["alice", "bob"]);
  } finally {
    await stack.shutdown();
  }
});
