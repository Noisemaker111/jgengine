import { expect, test } from "bun:test";

import { createWsBackend } from "./createWsBackend";
import type { TransportPipeFactory, TransportPipeHandlers } from "./pipe";
import { encodeWsMessage, type WsClientMessage, type WsServerMessage } from "./protocol";

type FakeSocket = {
  handlers: TransportPipeHandlers;
  sent: string[];
  close: () => void;
};

function createControllablePipe(): {
  factory: TransportPipeFactory;
  sockets: FakeSocket[];
  openLatest: () => void;
  closeLatest: () => void;
  replyLatest: (message: WsServerMessage) => void;
  lastClientMessage: () => WsClientMessage;
} {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    factory: (handlers) => {
      const socket: FakeSocket = {
        handlers,
        sent: [],
        close: () => handlers.onClose(),
      };
      sockets.push(socket);
      return {
        send: (data) => {
          socket.sent.push(data);
        },
        close: () => {
          handlers.onClose();
        },
      };
    },
    openLatest: () => {
      const socket = sockets[sockets.length - 1];
      if (socket === undefined) throw new Error("no socket");
      socket.handlers.onOpen();
    },
    closeLatest: () => {
      const socket = sockets[sockets.length - 1];
      if (socket === undefined) throw new Error("no socket");
      socket.handlers.onClose();
    },
    replyLatest: (message) => {
      const socket = sockets[sockets.length - 1];
      if (socket === undefined) throw new Error("no socket");
      socket.handlers.onMessage(encodeWsMessage(message));
    },
    lastClientMessage: () => {
      const socket = sockets[sockets.length - 1];
      if (socket === undefined) throw new Error("no socket");
      const raw = socket.sent[socket.sent.length - 1];
      if (raw === undefined) throw new Error("no message");
      return JSON.parse(raw) as WsClientMessage;
    },
  };
}

test("rpcTimeoutMs rejects pending requests that never receive a reply", async () => {
  const timers: Array<{ due: number; fn: () => void }> = [];
  let now = 0;
  const pipe = createControllablePipe();
  const backend = createWsBackend({
    userId: "alice",
    pipe: pipe.factory,
    rpcTimeoutMs: 50,
    setTimeoutFn: ((fn: () => void, ms: number) => {
      const handle = { due: now + ms, fn };
      timers.push(handle);
      return handle as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeoutFn: ((handle: unknown) => {
      const index = timers.indexOf(handle as { due: number; fn: () => void });
      if (index >= 0) timers.splice(index, 1);
    }) as typeof clearTimeout,
  });

  const joinPromise = backend.transport.joinServer({ gameId: "test-game" });
  pipe.openLatest();
  const hello = pipe.lastClientMessage();
  expect(hello.t).toBe("hello");
  pipe.replyLatest({ v: 1, t: "reply", id: (hello as { id: number }).id, ok: true, result: { userId: "alice" } });

  await Promise.resolve();
  await Promise.resolve();

  now = 50;
  for (const timer of [...timers]) {
    if (timer.due <= now) {
      timer.fn();
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    }
  }

  await expect(joinPromise).rejects.toThrow("RPC timeout");
  backend.close();
});

test("reconnect uses exponential backoff and is not subscription-gated", async () => {
  const delays: number[] = [];
  let scheduled: Array<{ delay: number; fn: () => void }> = [];
  const pipe = createControllablePipe();
  const backend = createWsBackend({
    userId: "alice",
    pipe: pipe.factory,
    reconnectDelayMs: 10,
    maxReconnectDelayMs: 80,
    rpcTimeoutMs: 0,
    setTimeoutFn: ((fn: () => void, ms: number) => {
      delays.push(ms);
      const handle = { delay: ms, fn };
      scheduled.push(handle);
      return handle as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeoutFn: ((handle: unknown) => {
      scheduled = scheduled.filter((entry) => entry !== handle);
    }) as typeof clearTimeout,
  });

  const joinPromise = backend.transport.joinServer({ gameId: "test-game" });
  pipe.openLatest();
  const hello = pipe.lastClientMessage() as { t: string; id: number };
  pipe.replyLatest({ v: 1, t: "reply", id: hello.id, ok: true, result: { userId: "alice" } });
  await Promise.resolve();
  await Promise.resolve();

  pipe.closeLatest();
  expect(delays.at(-1)).toBe(10);

  const firstReconnect = scheduled.shift();
  firstReconnect?.fn();
  expect(pipe.sockets).toHaveLength(2);
  pipe.openLatest();
  const hello2 = pipe.lastClientMessage() as { t: string; id: number };
  pipe.replyLatest({ v: 1, t: "reply", id: hello2.id, ok: true, result: { userId: "alice" } });
  await Promise.resolve();
  await Promise.resolve();

  const joinMsg = pipe.sockets[1]?.sent
    .map((raw) => JSON.parse(raw) as WsClientMessage)
    .find((message) => message.t === "join");
  expect(joinMsg?.t).toBe("join");
  if (joinMsg && joinMsg.t === "join") {
    pipe.replyLatest({
      v: 1,
      t: "reply",
      id: joinMsg.id,
      ok: true,
      result: { serverId: "srv-1", isNew: true },
    });
  }
  await expect(joinPromise).resolves.toEqual({ serverId: "srv-1", isNew: true });

  pipe.closeLatest();
  expect(delays.at(-1)).toBe(10);

  backend.close();
});

test("client rejects pending request when a malformed reply carries its id", async () => {
  const pipe = createControllablePipe();
  const backend = createWsBackend({
    userId: "alice",
    pipe: pipe.factory,
    rpcTimeoutMs: 0,
  });

  const joinPromise = backend.transport.joinServer({ gameId: "test-game" });
  pipe.openLatest();
  const hello = pipe.lastClientMessage() as { id: number };
  pipe.replyLatest({ v: 1, t: "reply", id: hello.id, ok: true, result: { userId: "alice" } });
  await Promise.resolve();
  await Promise.resolve();

  const join = pipe.sockets[0]?.sent
    .map((raw) => JSON.parse(raw) as WsClientMessage)
    .find((message) => message.t === "join") as { id: number } | undefined;
  expect(join).toBeDefined();
  pipe.sockets[0]?.handlers.onMessage(JSON.stringify({ v: 2, t: "reply", id: join?.id, ok: true }));
  await expect(joinPromise).rejects.toThrow("Protocol version mismatch");
  backend.close();
});
