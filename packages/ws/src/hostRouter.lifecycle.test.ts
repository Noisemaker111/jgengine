import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createHostedWorldSessionAsync } from "@jgengine/core/runtime/hostedWorldSession";
import { createGameHost, memoryPersistence, type GameHost } from "./host";
import { createHostRouter } from "./hostRouter";
import { createWorldGameHost } from "./worldHost";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function delayedHost(kind: "world" | "reducer") {
  const started = deferred();
  const released = deferred();
  let host: GameHost;
  let serverId = "world";
  let otherId = "other";
  if (kind === "world") {
    const definition = defineGameDefinition({ name: "Ownership probe", multiplayer: "off", features: { players: true } });
    host = createWorldGameHost({ slotsPerServer: 1, session: () => createHostedWorldSessionAsync({
      definition, content: {}, store: {
        async load() { started.resolve(); await released.promise; return null; },
        save() {},
      },
    }) });
  } else {
    const persistence = memoryPersistence();
    const original = createGameHost({ persistence, slotsPerServer: 1 });
    serverId = (await original.joinServer({ userId: "seed", gameId: "world" })).serverId;
    await original.leaveServer({ userId: "seed", serverId });
    otherId = (await original.joinServer({ userId: "seed", gameId: "world" })).serverId;
    await original.leaveServer({ userId: "seed", serverId: otherId });
    await original.stop();
    const load = persistence.loadServer;
    persistence.loadServer = async id => { started.resolve(); await released.promise; return load(id); };
    host = createGameHost({ persistence, slotsPerServer: 1 });
  }
  return { host, serverId, otherId, started, released };
}

for (const kind of ["world", "reducer"] as const) {
  test(`${kind}: disconnect during delayed load releases the late admission`, async () => {
    const stack = await delayedHost(kind);
    const router = createHostRouter({ host: stack.host, allowAnonymous: true, graceMs: 0 });
    const sent: unknown[] = [];
    const connection = router.connect({ send: raw => sent.push(JSON.parse(raw)), close() {} });
    connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "departed" }));
    await router.drain();
    connection.handleRaw(JSON.stringify({ v: 1, t: "join", id: 2, gameId: "world", serverId: stack.serverId }));
    await stack.started.promise;
    connection.close();
    stack.released.resolve();
    try {
      await router.drain();
      await Bun.sleep(10);
      await router.drain();
      expect(sent).toHaveLength(1);
      expect(await stack.host.isMember({ userId: "departed", serverId: stack.serverId })).toBe(false);
      await expect(stack.host.joinServer({ userId: "replacement", gameId: "world", serverId: stack.serverId })).resolves.toMatchObject({ serverId: stack.serverId });
    } finally { router.close(); await router.drain(); await stack.host.stop(); }
  });

  test(`${kind}: an accepted delayed reconnect retains the late admission`, async () => {
    const stack = await delayedHost(kind);
    const reconnectStarted = deferred();
    const reconnectReleased = deferred();
    const join = stack.host.joinServer;
    let joins = 0;
    stack.host.joinServer = async args => {
      if (++joins === 2) { reconnectStarted.resolve(); await reconnectReleased.promise; }
      return join(args);
    };
    const router = createHostRouter({ host: stack.host, allowAnonymous: true, graceMs: 0 });
    const sent: unknown[] = [];
    const original = router.connect({ send() {}, close() {} });
    original.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "returning" }));
    await router.drain();
    original.handleRaw(JSON.stringify({ v: 1, t: "join", id: 2, gameId: "world", serverId: stack.serverId }));
    await stack.started.promise;
    original.close();
    const fresh = router.connect({ send: raw => sent.push(JSON.parse(raw)), close() {} });
    fresh.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 3, userId: "returning" }));
    fresh.handleRaw(JSON.stringify({ v: 1, t: "join", id: 4, gameId: "world", serverId: stack.serverId }));
    await reconnectStarted.promise;
    stack.released.resolve();
    await Bun.sleep(10);
    try {
      expect(await stack.host.isMember({ userId: "returning", serverId: stack.serverId })).toBe(true);
      reconnectReleased.resolve();
      await router.drain();
      expect(sent).toContainEqual(expect.objectContaining({ id: 4, ok: true }));
      expect(await stack.host.isMember({ userId: "returning", serverId: stack.serverId })).toBe(true);
      fresh.handleRaw(JSON.stringify({ v: 1, t: "subscribe", id: 5, channel: "server", serverId: stack.serverId }));
      await router.drain();
      expect(sent).toContainEqual(expect.objectContaining({ t: "update", serverId: stack.serverId }));
      await expect(stack.host.joinServer({ userId: "other", gameId: "world", serverId: stack.serverId })).rejects.toThrow("full");
    } finally {
      reconnectReleased.resolve(); fresh.close(); router.close(); await router.drain(); await stack.host.stop();
    }
  });

  test(`${kind}: a reconnect completing first keeps its subscription after the old result arrives`, async () => {
    const stack = await delayedHost(kind);
    const firstCommitted = deferred();
    const firstReturned = deferred();
    const join = stack.host.joinServer;
    let joins = 0;
    stack.host.joinServer = async args => {
      const first = ++joins === 1;
      const result = await join(args);
      if (first) { firstCommitted.resolve(); await firstReturned.promise; }
      return result;
    };
    const router = createHostRouter({ host: stack.host, allowAnonymous: true, graceMs: 0 });
    const original = router.connect({ send() {}, close() {} });
    original.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "returning" }));
    await router.drain();
    original.handleRaw(JSON.stringify({ v: 1, t: "join", id: 2, gameId: "world", serverId: stack.serverId }));
    await stack.started.promise;
    original.close(); stack.released.resolve();
    await firstCommitted.promise;
    const subscribed = deferred();
    const updates: unknown[] = [];
    const fresh = router.connect({ send: raw => {
      const message = JSON.parse(raw);
      if (message.t === "update") { updates.push(message); subscribed.resolve(); }
    }, close() {} });
    fresh.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 3, userId: "returning" }));
    fresh.handleRaw(JSON.stringify({ v: 1, t: "join", id: 4, gameId: "world", serverId: stack.serverId }));
    fresh.handleRaw(JSON.stringify({ v: 1, t: "subscribe", id: 5, channel: "server", serverId: stack.serverId }));
    await subscribed.promise;
    firstReturned.resolve();
    try {
      await router.drain(); await Bun.sleep(10); await router.drain();
      expect(await stack.host.isMember({ userId: "returning", serverId: stack.serverId })).toBe(true);
      expect(await stack.host.getServerView({ userId: "returning", serverId: stack.serverId })).not.toBeNull();
      fresh.handleRaw(JSON.stringify({ v: 1, t: "unsubscribe", id: 6, channel: "server", serverId: stack.serverId }));
      fresh.handleRaw(JSON.stringify({ v: 1, t: "subscribe", id: 7, channel: "server", serverId: stack.serverId }));
      await router.drain();
      expect(updates).toHaveLength(2);
      expect(updates).toEqual([expect.objectContaining({ serverId: stack.serverId }), expect.objectContaining({ serverId: stack.serverId })]);
    } finally { fresh.close(); router.close(); await router.drain(); await stack.host.stop(); }
  });

  test(`${kind}: an unrelated pending world admission does not retain the departed world`, async () => {
    const stack = await delayedHost(kind);
    const otherStarted = deferred();
    const otherReleased = deferred();
    const join = stack.host.joinServer;
    stack.host.joinServer = async args => {
      if (args.serverId === stack.otherId) { otherStarted.resolve(); await otherReleased.promise; }
      return join(args);
    };
    const router = createHostRouter({ host: stack.host, allowAnonymous: true, graceMs: 0 });
    const original = router.connect({ send() {}, close() {} });
    original.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "traveler" }));
    await router.drain();
    original.handleRaw(JSON.stringify({ v: 1, t: "join", id: 2, gameId: "world", serverId: stack.serverId }));
    await stack.started.promise; original.close();
    const updates: unknown[] = [];
    const fresh = router.connect({ send: raw => {
      const message = JSON.parse(raw);
      if (message.t === "update") updates.push(message);
    }, close() {} });
    fresh.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 3, userId: "traveler" }));
    fresh.handleRaw(JSON.stringify({ v: 1, t: "join", id: 4, gameId: "world", serverId: stack.otherId }));
    await otherStarted.promise;
    stack.released.resolve(); await Bun.sleep(10);
    try {
      expect(await stack.host.isMember({ userId: "traveler", serverId: stack.serverId })).toBe(false);
      otherReleased.resolve(); await router.drain();
      expect(await stack.host.isMember({ userId: "traveler", serverId: stack.otherId })).toBe(true);
      fresh.handleRaw(JSON.stringify({ v: 1, t: "subscribe", id: 5, channel: "server", serverId: stack.otherId }));
      await router.drain();
      expect(updates).toEqual([expect.objectContaining({ serverId: stack.otherId })]);
    } finally { otherReleased.resolve(); fresh.close(); router.close(); await router.drain(); await stack.host.stop(); }
  });
}

test("a code join completing after disconnect releases its admitted membership", async () => {
  const persistence = memoryPersistence();
  const original = createGameHost({ persistence, slotsPerServer: 1 });
  const { serverId } = await original.joinServer({ userId: "seed", gameId: "world", attributes: { visibility: "private", joinCode: "invite" } });
  await original.leaveServer({ userId: "seed", serverId });
  await original.stop();
  const started = deferred();
  const released = deferred();
  const load = persistence.loadServer;
  persistence.loadServer = async id => { started.resolve(); await released.promise; return load(id); };
  const host = createGameHost({ persistence, slotsPerServer: 1 });
  const router = createHostRouter({ host, allowAnonymous: true, graceMs: 0 });
  const connection = router.connect({ send() {}, close() {} });
  connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "departed" }));
  await router.drain();
  connection.handleRaw(JSON.stringify({ v: 1, t: "joinByCode", id: 2, gameId: "world", code: "invite" }));
  await started.promise;
  connection.close(); released.resolve();
  try {
    await router.drain(); await Bun.sleep(10); await router.drain();
    expect(await host.isMember({ userId: "departed", serverId })).toBe(false);
    await expect(host.joinByCode({ userId: "replacement", gameId: "world", code: "invite" })).resolves.toMatchObject({ serverId });
  } finally { router.close(); await router.drain(); await host.stop(); }
});

test("late admission retains the configured reconnect grace before releasing capacity", async () => {
  const stack = await delayedHost("world");
  const router = createHostRouter({ host: stack.host, allowAnonymous: true, graceMs: 100 });
  const connection = router.connect({ send() {}, close() {} });
  connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "departed" }));
  await router.drain();
  connection.handleRaw(JSON.stringify({ v: 1, t: "join", id: 2, gameId: "world", serverId: stack.serverId }));
  await stack.started.promise;
  connection.close(); stack.released.resolve();
  try {
    await router.drain();
    expect(await stack.host.isMember({ userId: "departed", serverId: stack.serverId })).toBe(true);
    await Bun.sleep(110); await router.drain();
    expect(await stack.host.isMember({ userId: "departed", serverId: stack.serverId })).toBe(false);
  } finally { router.close(); await router.drain(); await stack.host.stop(); }
});

test("drain awaits a started grace cleanup through router close", async () => {
  const stack = await delayedHost("world");
  const leaving = deferred();
  const released = deferred();
  const leave = stack.host.leaveServer;
  stack.host.leaveServer = async args => { leaving.resolve(); await released.promise; return leave(args); };
  const router = createHostRouter({ host: stack.host, allowAnonymous: true, graceMs: 0 });
  const connection = router.connect({ send() {}, close() {} });
  connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "departed" }));
  await router.drain();
  connection.handleRaw(JSON.stringify({ v: 1, t: "join", id: 2, gameId: "world", serverId: stack.serverId }));
  await stack.started.promise; connection.close(); stack.released.resolve();
  await leaving.promise;
  router.close();
  let settled = false;
  const drained = router.drain().then(() => { settled = true; });
  try {
    await Promise.resolve();
    expect(settled).toBe(false);
    released.resolve(); await drained;
    expect(await stack.host.isMember({ userId: "departed", serverId: stack.serverId })).toBe(false);
  } finally { released.resolve(); router.close(); await router.drain(); await stack.host.stop(); }
});

test("router close cancels grace timers that have not started", async () => {
  const stack = await delayedHost("world");
  const router = createHostRouter({ host: stack.host, allowAnonymous: true, graceMs: 50 });
  const connection = router.connect({ send() {}, close() {} });
  connection.handleRaw(JSON.stringify({ v: 1, t: "hello", id: 1, userId: "departed" }));
  await router.drain();
  connection.handleRaw(JSON.stringify({ v: 1, t: "join", id: 2, gameId: "world", serverId: stack.serverId }));
  await stack.started.promise; connection.close(); stack.released.resolve();
  try {
    await router.drain(); router.close(); await router.drain();
    await Bun.sleep(60);
    expect(await stack.host.isMember({ userId: "departed", serverId: stack.serverId })).toBe(true);
  } finally { router.close(); await router.drain(); await stack.host.stop(); }
});
