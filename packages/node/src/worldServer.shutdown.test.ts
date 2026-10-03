import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { HostedWorldRecord, HostedWorldStore } from "@jgengine/core/runtime/hostedWorldSession";
import { createWsBackend } from "@jgengine/ws/createWsBackend";
import type { WorldPersistence } from "./persistence";
import { createWorldGameServer } from "./worldServer";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

const turn = (ms = 25) => new Promise<void>(resolve => setTimeout(resolve, ms));

function fixture(store?: HostedWorldStore) {
  const records: HostedWorldRecord[] = [];
  const persistence: WorldPersistence = { store: () => store ?? {
    load: async () => null,
    async save(record) { records.push(structuredClone(record)); },
  } };
  const game = defineGameDefinition({ name: "Shutdown world", multiplayer: "off", features: { players: true },
    loop: {
      onInit(ctx: GameContext) {
        ctx.game.commands.define("bump", { apply(state) {
          state.game.store.set("bumps", (state.game.store.get("bumps") as number | undefined ?? 0) + 1);
        } });
      },
      onNewPlayer(ctx: GameContext, player) { ctx.game.store.set(`joined:${player!.userId}`, true); },
      onTick(ctx: GameContext) { ctx.game.store.set("ticks", (ctx.game.store.get("ticks") as number | undefined ?? 0) + 1); },
    },
  });
  const server = createWorldGameServer({ resolveGame: () => ({ game, content: {} }), persistence, allowAnonymous: true, port: 0, tickHz: 100 });
  const client = createWsBackend({ userId: "alice", url: `ws://127.0.0.1:${server.port()}` });
  return { server, client, records };
}

function stored(record: HostedWorldRecord | undefined, key: string): unknown {
  return (record?.snapshot.store as [string, unknown][] | undefined)?.find(([id]) => id === key)?.[1];
}

test("real socket shutdown drains an accepted delayed command before the final world save", async () => {
  const { server, client, records } = fixture();
  const entered = deferred();
  const release = deferred();
  const original = server.host.runCommand.bind(server.host);
  server.host.runCommand = async args => { entered.resolve(); await release.promise; return original(args); };
  let closing: Promise<void> | undefined;
  try {
    await client.transport.joinServer({ gameId: "shutdown" });
    const command = client.transport.runCommand({ serverId: "shutdown", command: "bump", input: {} }).catch(() => undefined);
    await entered.promise;
    const queued = client.transport.runCommand({ serverId: "shutdown", command: "bump", input: {} }).catch(() => undefined);
    await turn();
    let finished = false;
    closing = server.close();
    void closing.then(() => { finished = true; });
    await turn(600);
    expect(finished).toBe(false);
    release.resolve();
    await closing;
    client.close();
    await command;
    await queued;
    expect(stored(records.at(-1), "bumps")).toBe(1);
    expect(server.close()).toBe(closing);
    await expect(original({ userId: "alice", serverId: "shutdown", command: "bump", input: {} })).rejects.toThrow("closed");
  } finally { release.resolve(); client.close(); await (closing ?? server.close()); }
});

test("the Node socket adapter close waits for an accepted world load and is idempotent", async () => {
  const entered = deferred();
  const release = deferred();
  const { server, client } = fixture({ load: async () => { entered.resolve(); await release.promise; return null; }, save: async () => {} });
  let closing: Promise<void> | undefined;
  try {
    const joining = client.transport.joinServer({ gameId: "shutdown" }).catch(() => undefined);
    await entered.promise;
    let finished = false;
    closing = server.ws.close();
    void closing.then(() => { finished = true; });
    await turn(600);
    expect(finished).toBe(false);
    expect(server.ws.close()).toBe(closing);
    release.resolve();
    await closing;
    client.close();
    await joining;
    expect(await server.host.isMember({ userId: "alice", serverId: "shutdown" })).toBe(true);
  } finally { release.resolve(); client.close(); await server.close(); }
});

test("a real socket join retry finishes loading before close persists its player state", async () => {
  const entered = deferred();
  const release = deferred();
  let loads = 0;
  const records: HostedWorldRecord[] = [];
  const { server, client } = fixture({
    async load() { if (++loads === 1) throw new Error("temporary load failure"); entered.resolve(); await release.promise; return null; },
    async save(record) { records.push(structuredClone(record)); },
  });
  let closing: Promise<void> | undefined;
  try {
    await expect(client.transport.joinServer({ gameId: "shutdown" })).rejects.toThrow("temporary load failure");
    const retry = client.transport.joinServer({ gameId: "shutdown" }).catch(() => undefined);
    await entered.promise;
    closing = server.close();
    release.resolve();
    await closing;
    client.close();
    await retry;
    expect(loads).toBe(2);
    expect(stored(records.at(-1), "joined:alice")).toBe(true);
    const repeated = server.close();
    void repeated.catch(() => {});
    expect(repeated).toBe(closing);
    await expect(server.host.joinServer({ userId: "bob", gameId: "shutdown" })).rejects.toThrow("closed");
  } finally { release.resolve(); client.close(); await (closing ?? server.close()); }
});

test("close retries dirty state left by a failed admission save", async () => {
  let denied = true;
  const records: HostedWorldRecord[] = [];
  const { server, client } = fixture({ load: async () => null, async save(record) {
    if (denied) throw new Error("admission save failure");
    records.push(structuredClone(record));
  } });
  try {
    await expect(client.transport.joinServer({ gameId: "shutdown" })).rejects.toThrow("admission save failure");
    expect(await server.host.isMember({ userId: "alice", serverId: "shutdown" })).toBe(false);
    denied = false;
    await server.close();
    expect(stored(records.at(-1), "joined:alice")).toBe(true);
    expect(records).toHaveLength(1);
  } finally { denied = false; client.close(); await server.close(); }
});

test("close awaits a delayed final save with socket intake and ticks already fenced", async () => {
  const entered = deferred();
  const release = deferred();
  let saves = 0;
  const records: HostedWorldRecord[] = [];
  const { server, client } = fixture({ load: async () => null, async save(record) {
    records.push(structuredClone(record));
    if (++saves === 2) { entered.resolve(); await release.promise; }
  } });
  let closing: Promise<void> | undefined;
  try {
    await client.transport.joinServer({ gameId: "shutdown" });
    let finished = false;
    closing = server.close();
    void closing.then(() => { finished = true; });
    await entered.promise;
    expect(server.ws.wss.clients.size).toBe(0);
    expect(server.close()).toBe(closing);
    server.tick(1);
    server.start();
    await turn();
    expect(finished).toBe(false);
    release.resolve();
    await closing;
    await server.flush();
    expect(stored(records.at(-1), "ticks")).toBeUndefined();
  } finally { release.resolve(); server.stop(); client.close(); await (closing ?? server.close()); }
});

test("a final save failure rejects the shared close promise after sockets retire", async () => {
  let denied = false;
  let saves = 0;
  const { server, client } = fixture({ load: async () => null, async save() { saves++; if (denied) throw new Error("final save failure"); } });
  try {
    await client.transport.joinServer({ gameId: "shutdown" });
    denied = true;
    const closing = server.close();
    await expect(closing).rejects.toThrow("final save failure");
    const repeated = server.close();
    void repeated.catch(() => {});
    expect(repeated).toBe(closing);
    await expect(server.close()).rejects.toThrow("final save failure");
    expect(saves).toBe(2);
    expect(server.ws.wss.clients.size).toBe(0);
    await expect(server.host.joinServer({ userId: "bob", gameId: "shutdown" })).rejects.toThrow("closed");
  } finally { client.close(); await server.close().catch(() => {}); }
});

test("stop remains restartable while close permanently fences manual and interval ticks", async () => {
  const { server, client, records } = fixture();
  try {
    await client.transport.joinServer({ gameId: "shutdown" });
    server.start();
    await turn();
    server.stop();
    await server.flush();
    const stopped = stored(records.at(-1), "ticks") as number;
    await turn();
    await server.flush();
    expect(stored(records.at(-1), "ticks")).toBe(stopped);
    server.start();
    await turn();
    server.stop();
    await server.flush();
    expect(stored(records.at(-1), "ticks") as number).toBeGreaterThan(stopped);
    await server.close();
    const closed = stored(records.at(-1), "ticks");
    server.tick(1);
    server.start();
    await turn();
    await server.flush();
    expect(stored(records.at(-1), "ticks")).toBe(closed);
  } finally { server.stop(); client.close(); await server.close(); }
});
