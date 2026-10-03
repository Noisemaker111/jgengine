import { expect, test } from "bun:test";
import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import {
  createHostedWorldSession,
  createHostedWorldSessionAsync,
  memoryWorldStore,
  type HostedWorldRecord,
  type HostedWorldSession,
  type SyncHostedWorldStore,
} from "@jgengine/core/runtime/hostedWorldSession";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { createWorldGameHost } from "./worldHost";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(kind: "profiles-async" | "actors-sync" = "profiles-async", resident = false) {
  const records = new Map<string, HostedWorldRecord>();
  const stores = new Map<string, SyncHostedWorldStore>();
  const sessions: HostedWorldSession[] = [];
  let denied = false;
  let saveGate: { started: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> } | null = null;
  let loadGate: { started: ReturnType<typeof deferred>; released: ReturnType<typeof deferred> } | null = null;
  let ticks = 0;
  let writes = 0;
  const definition = defineGameDefinition({ name: kind, multiplayer: "off", features: { players: true }, loop: {
    onInit(ctx: GameContext) {
      if (kind === "actors-sync") ctx.scene.entity.spawn("marker", { id: "marker", position: [0, 0, 0] });
      ctx.game.commands.define("earn", { apply(state) { state.game.store.set("earned", (state.game.store.get("earned") as number | undefined ?? 0) + 3); } });
    },
    onNewPlayer(ctx, player) { ctx.game.store.set(`progress:${player!.userId}`, 7); },
    onTick(ctx, dt) {
      ticks += 1;
      if (kind === "profiles-async") ctx.game.store.set("elapsed", (ctx.game.store.get("elapsed") as number | undefined ?? 0) + dt);
      else {
        const marker = ctx.scene.entity.get("marker")!;
        ctx.scene.entity.setPose(marker.id, { position: [marker.position[0] + dt, 0, 0] });
      }
    },
  } });
  const content = { entityById: (id: string) => id === "marker" ? { stats: { health: { max: 10 } } } : null };
  const host = createWorldGameHost({ slotsPerServer: 1, session: async ({ serverId }) => {
    let session: HostedWorldSession;
    if (kind === "profiles-async") session = await createHostedWorldSessionAsync({ definition, content, store: {
      async load() {
        if (loadGate !== null) { loadGate.started.resolve(); await loadGate.released.promise; }
        return records.has(serverId) ? structuredClone(records.get(serverId)!) : null;
      },
      async save(record) {
        if (saveGate !== null) { saveGate.started.resolve(); await saveGate.released.promise; }
        if (denied) throw new Error("save denied");
        writes += 1;
        records.set(serverId, structuredClone(record));
      },
    } });
    else {
      let store = stores.get(serverId);
      if (store === undefined) { store = memoryWorldStore(); stores.set(serverId, store); }
      session = createHostedWorldSession({ definition, content, store: { load: store.load, save(record) {
        if (denied) throw new Error("save denied");
        writes += 1; store!.save(record); records.set(serverId, structuredClone(record));
      } } });
    }
    if (resident) session.join("resident", !session.hasPlayer("resident"));
    sessions.push(session);
    return session;
  } });
  return {
    host, records, sessions,
    measure: () => ({ sessions: sessions.length, ticks, writes }),
    deny(value: boolean) { denied = value; },
    holdSave() { saveGate = { started: deferred(), released: deferred() }; return saveGate; },
    holdLoad() { loadGate = { started: deferred(), released: deferred() }; return loadGate; },
  };
}

const join = (data: ReturnType<typeof fixture>, userId = "alice", serverId = "world", role?: "player" | "spectator") =>
  data.host.joinServer({ userId, gameId: "game", serverId, role });
const leave = (data: ReturnType<typeof fixture>, userId = "alice", serverId = "world") =>
  data.host.leaveServer({ userId, serverId });

for (const kind of ["profiles-async", "actors-sync"] as const) {
  test(`${kind}: explicit unload stops idle traversal and reloads identical saved progress`, async () => {
    const data = fixture(kind);
    try {
      for (let index = 0; index < 4; index += 1) { await join(data, "alice", `world-${index}`); await leave(data, "alice", `world-${index}`); }
      data.host.tick(2); await data.host.flushAll();
      const original = data.sessions[0]!;
      const revision = original.revision();
      for (let index = 0; index < 4; index += 1) expect(await data.host.unload(`world-${index}`)).toBe("unloaded");
      const before = data.measure();
      data.host.tick(1);
      expect(await data.host.flushAll()).toBe(0);
      expect(data.measure()).toEqual(before);
      expect((await join(data, "alice", "world-0")).isNew).toBe(false);
      const restored = data.sessions.at(-1)!;
      expect(restored).not.toBe(original);
      expect(restored.runner().context().game.store.get("progress:alice")).toBe(7);
      if (kind === "profiles-async") expect(restored.runner().context().game.store.get("elapsed")).toBe(2);
      else expect(restored.runner().context().scene.entity.get("marker")!.position).toEqual([2, 0, 0]);
      expect(restored.revision()).toBeGreaterThan(revision);
      expect(await data.host.getServerView({ userId: "alice", serverId: "world-0" })).toMatchObject({ serverId: "world-0", gameId: "game" });
      expect(await data.host.getServerView({ userId: "outsider", serverId: "world-0" })).toBeNull();
      await expect(join(data, "bob", "world-0")).rejects.toThrow("full");
    } finally { await data.host.stop(); }
  });

  test(`${kind}: players and spectators refuse unload without saving or changing access`, async () => {
    const data = fixture(kind);
    try {
      await join(data); const occupied = data.measure();
      expect(await data.host.unload("world")).toBe("occupied");
      expect(data.measure()).toEqual(occupied);
      expect(await data.host.isMember({ userId: "alice", serverId: "world" })).toBe(true);
      await leave(data); await join(data, "watcher", "world", "spectator");
      expect(data.sessions[0]!.members()).toEqual([]);
      expect(await data.host.unload("world")).toBe("occupied");
      expect(await data.host.getServerView({ userId: "watcher", serverId: "world" })).not.toBeNull();
      expect(await data.host.runCommand({ userId: "watcher", serverId: "world", command: "earn", input: {} })).toEqual({ ok: false, reason: "not-a-player" });
      await leave(data, "watcher"); expect(await data.host.unload("world")).toBe("unloaded");
      expect(await data.host.unload("world")).toBe("missing");
    } finally { await data.host.stop(); }
  });

  test(`${kind}: final save failure retains the world and permits a later retry`, async () => {
    const data = fixture(kind);
    try {
      await join(data); await leave(data);
      const original = data.sessions[0]!;
      original.runner().context().game.store.set("earned", 19);
      const before = data.measure();
      data.deny(true); await expect(data.host.unload("world")).rejects.toThrow("save denied");
      expect(data.measure()).toEqual(before);
      expect(original.runner().context().game.store.get("earned")).toBe(19);
      data.deny(false); expect(await data.host.flushAll()).toBe(1);
      expect(await data.host.unload("world")).toBe("unloaded");
      await join(data);
      expect(data.sessions.at(-1)!.runner().context().game.store.get("earned")).toBe(19);
      expect(data.sessions).toHaveLength(2);
    } finally { data.deny(false); await data.host.stop(); }
  });
}

test("unload preserves an initially resident host until its explicit leave", async () => {
  const data = fixture("profiles-async", true);
  try {
    await join(data, "watcher", "world", "spectator"); await leave(data, "watcher");
    expect(await data.host.unload("world")).toBe("occupied");
    await expect(join(data, "alice")).rejects.toThrow("full");
    await leave(data, "resident"); expect(await data.host.unload("world")).toBe("unloaded");
  } finally { await data.host.stop(); }
});

test("a failed admission profile persists on unload without reserving occupancy", async () => {
  const data = fixture();
  try {
    data.deny(true); await expect(join(data)).rejects.toThrow("save denied");
    expect(await data.host.isMember({ userId: "alice", serverId: "world" })).toBe(false);
    expect(await data.host.getServerView({ userId: "alice", serverId: "world" })).toBeNull();
    data.deny(false); expect(await data.host.unload("world")).toBe("unloaded");
    expect((await join(data)).isNew).toBe(false);
    expect(data.sessions.at(-1)!.runner().context().game.store.get("progress:alice")).toBe(7);
  } finally { data.deny(false); await data.host.stop(); }
});

test("unload final save fences ticks, duplicate unload and reload until completion", async () => {
  const data = fixture();
  await join(data); await leave(data);
  data.sessions[0]!.runner().context().game.store.set("earned", 11);
  const gate = data.holdSave();
  const unloading = data.host.unload("world");
  let unloaded = false; void unloading.then(() => { unloaded = true; });
  await gate.started.promise;
  const duplicate = data.host.unload("world");
  const reloading = join(data);
  await Promise.resolve();
  expect(unloaded).toBe(false);
  expect(data.sessions).toHaveLength(1);
  const before = data.measure();
  data.host.tick(1);
  expect(data.measure()).toEqual(before);
  try {
    gate.released.resolve();
    expect(await unloading).toBe("unloaded");
    expect(await duplicate).toBe("missing");
    expect((await reloading).isNew).toBe(false);
    expect(data.sessions).toHaveLength(2);
    expect(data.sessions[1]!.runner().context().game.store.get("earned")).toBe(11);
    expect(await data.host.isMember({ userId: "alice", serverId: "world" })).toBe(true);
  } finally { gate.released.resolve(); await data.host.stop(); }
});

test("stop drains accepted command, leave, unload and reload in order", async () => {
  const data = fixture();
  await join(data);
  const gate = data.holdSave();
  const command = data.host.runCommand({ userId: "alice", serverId: "world", command: "earn", input: {} });
  await gate.started.promise;
  const leaving = leave(data);
  const unloading = data.host.unload("world");
  const reloading = join(data);
  const stopping = data.host.stop();
  expect(data.host.stop()).toBe(stopping);
  await expect(data.host.unload("world")).rejects.toThrow("closed");
  await expect(join(data, "bob")).rejects.toThrow("closed");
  let done = false; void stopping.then(() => { done = true; });
  expect(done).toBe(false);
  gate.released.resolve();
  expect(await command).toEqual({ ok: true }); await leaving;
  expect(await unloading).toBe("unloaded"); await reloading; await stopping;
  expect(data.sessions).toHaveLength(2);
  expect(data.sessions[1]!.runner().context().game.store.get("earned")).toBe(3);
  expect(await data.host.getServerView({ userId: "alice", serverId: "world" })).toBeNull();
});

test("unload queued behind a delayed admission refuses its eventual player", async () => {
  const data = fixture();
  const gate = data.holdLoad();
  const joining = join(data); await gate.started.promise;
  const unloading = data.host.unload("world");
  try {
    gate.released.resolve(); await joining;
    expect(await unloading).toBe("occupied");
    expect(data.sessions).toHaveLength(1);
    expect(await data.host.isMember({ userId: "alice", serverId: "world" })).toBe(true);
  } finally { gate.released.resolve(); await data.host.stop(); }
});
