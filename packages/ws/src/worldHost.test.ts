import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import {
  createHostedWorldSession,
  type HostedWorldSession,
} from "@jgengine/core/runtime/hostedWorldSession";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { GameRuntimeServerView } from "@jgengine/core/runtime/transport";
import { createWorldMirror } from "@jgengine/core/runtime/worldMirror";
import type { WorldSyncFrame } from "@jgengine/core/runtime/transport";
import type { WorldSnapshot } from "@jgengine/core/runtime/worldSnapshot";
import { INPUT_COMMAND } from "@jgengine/core/runtime/hostedGameRunner";
import { createHostRouter, loopbackPipe } from "./hostRouter";
import { createWsBackend } from "./createWsBackend";
import { createWorldGameHost } from "./worldHost";

const CONTENT: GameContextContent = {
  entityById: (catalogId) => (catalogId === "hero" ? { stats: { health: { max: 10 } } } : null),
};

function definition() {
  return defineGameDefinition({
    name: "Shared",
    assets: createAssetCatalog(),
    multiplayer: "off",
    features: { players: true },
    loop: {
      onNewPlayer(ctx: GameContext, player) {
        ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
      },
      onTick(ctx: GameContext, dt) {
        for (const player of ctx.game.players?.list() ?? []) {
          const hero = ctx.scene.entity.get(player.userId);
          if (hero) ctx.scene.entity.setPose(player.userId, { position: [hero.position[0] + dt, 0, 0] });
        }
      },
    },
  });
}

function sharedHost(): { host: ReturnType<typeof createWorldGameHost>; session: HostedWorldSession } {
  const session = createHostedWorldSession({ definition: definition(), content: CONTENT });
  return { host: createWorldGameHost({ session: () => session }), session };
}

function entityIds(view: GameRuntimeServerView | null): string[] {
  const snapshot = view?.serverState as WorldSnapshot | undefined;
  return ((snapshot?.["entities"] ?? []) as { id: string }[]).map((e) => e.id);
}

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
        const timer = setTimeout(() => reject(new Error("timed out")), timeoutMs);
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
  };
}

describe("createWorldGameHost", () => {
  test("failed persistence withholds a purchase event, then its retry saves and broadcasts once", async () => {
    let failing = false;
    const session = createHostedWorldSession({ definition: definition(), content: CONTENT, store: {
      load: () => null,
      async save() { if (failing) throw new Error("disk unavailable"); },
    } });
    const host = createWorldGameHost({ session: () => session });
    await host.joinServer({ userId: "alice", gameId: "shared" });
    const events: string[] = [];
    host.subscribe((event) => events.push(event.type));
    const ctx = session.runner().context();
    ctx.game.economy.grant("alice", "copper", 100);
    ctx.game.commands.define("buy", { apply(state) {
      state.game.economy.charge("alice", "copper", 10);
      state.game.store.set("delivered", true);
    } });
    const args = { userId: "alice", serverId: "shared", command: "buy", input: { __jgWsOpId: "retry-me" } };
    failing = true;
    await expect(host.runCommand(args)).rejects.toThrow("disk unavailable");
    expect(events).toEqual([]);
    failing = false;
    expect(await host.runCommand(args)).toEqual({ ok: true });
    expect(ctx.game.economy.balance("alice", "copper")).toBe(90);
    expect(events).toEqual(["server"]);
    expect(await host.runCommand(args)).toEqual({ ok: true });
    expect(events).toEqual(["server"]);
  });

  test("concurrent joins resolve one world and wait for storage before broadcasting", async () => {
    let release!: () => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => { began = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let writes = 0;
    const session = createHostedWorldSession({ definition: definition(), content: CONTENT, store: {
      load: () => null,
      async save() { writes += 1; if (writes === 1) { began(); await gate; } },
    } });
    let resolutions = 0;
    const host = createWorldGameHost({ async session() { resolutions += 1; return session; } });
    const events: string[] = [];
    host.subscribe((event) => events.push(event.type));
    const alice = host.joinServer({ userId: "alice", gameId: "shared" });
    const bob = host.joinServer({ userId: "bob", gameId: "shared" });
    await started;
    expect(events).toEqual([]);
    expect(resolutions).toBe(1);
    expect(session.members()).toEqual(["alice"]);
    host.tick(1);
    expect(session.runner().context().time.now()).toBe(0);
    release();
    await Promise.all([alice, bob]);
    expect(resolutions).toBe(1);
    expect(session.members()).toEqual(["alice", "bob"]);
    expect(events.filter((type) => type === "server")).toHaveLength(2);
  });

  test("concurrent purchase retries apply once and non-players cannot command the world", async () => {
    const { host, session } = sharedHost();
    await host.joinServer({ userId: "alice", gameId: "shared" });
    await host.joinServer({ userId: "observer", gameId: "shared", role: "spectator" });
    const ctx = session.runner().context();
    ctx.game.economy.grant("alice", "copper", 100);
    ctx.game.commands.define("buy", { apply(state) {
      state.game.economy.charge(state.player.userId, "copper", 10);
      state.game.store.set("deliveries", Number(state.game.store.get("deliveries") ?? 0) + 1);
    } });
    const command = { serverId: "shared", command: "buy", input: { __jgWsOpId: "client:1" } };
    const results = await Promise.all([host.runCommand({ ...command, userId: "alice" }), host.runCommand({ ...command, userId: "alice" })]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(ctx.game.economy.balance("alice", "copper")).toBe(90);
    expect(ctx.game.store.get("deliveries")).toBe(1);
    for (const userId of ["stranger", "observer"]) {
      expect(await host.runCommand({ ...command, userId })).toEqual({ ok: false, reason: "not-a-player" });
    }
  });

  test("serves the world snapshot as serverState and broadcasts on join/command/tick", async () => {
    const { host } = sharedHost();
    const events: string[] = [];
    host.subscribe((e) => events.push(e.type));

    const joined = await host.joinServer({ userId: "alice", gameId: "shared" });
    expect(joined).toEqual({ serverId: "shared", isNew: true });
    expect(await host.isMember({ userId: "alice", serverId: "shared" })).toBe(true);
    expect(events).toContain("server");

    const afterJoin = await host.getServerView({ userId: "alice", serverId: "shared" });
    expect(entityIds(afterJoin)).toContain("alice");
    expect(afterJoin?.memberUserIds).toEqual(["alice"]);

    const before = afterJoin!.revision;
    host.tick(1);
    const afterTick = await host.getServerView({ userId: "alice", serverId: "shared" });
    expect(afterTick!.revision).toBeGreaterThan(before);
    const hero = (afterTick!.serverState as WorldSnapshot)["entities"] as { id: string; position: number[] }[];
    expect(hero.find((e) => e.id === "alice")?.position[0]).toBeCloseTo(1);

    expect(await host.getServerView({ userId: "alice", serverId: "missing" })).toBeNull();
  });

  test("loopback: a client mirrors the authoritative world's serverState over the ws stack", async () => {
    const { host } = sharedHost();
    const router = createHostRouter({ host, allowAnonymous: true });
    const alice = createWsBackend({ userId: "alice", pipe: loopbackPipe(router) });
    try {
      const { serverId } = await alice.transport.joinServer({ gameId: "shared" });
      const views = channel<GameRuntimeServerView | null>();
      let latestView: GameRuntimeServerView | null = null;
      const mirror = createWorldMirror({ hydrate(snapshot) {
        if (latestView !== null) views.push({ ...latestView, serverState: snapshot });
      } });
      alice.feeds?.subscribeServer(serverId, (view) => {
        latestView = view;
        const frame = view?.serverState as WorldSyncFrame | undefined;
        if (frame?.kind === "baseline") mirror.applyBaseline(frame.revision, frame.snapshot);
        else if (frame?.kind === "diff") mirror.applyDiff(frame.diff);
      });

      const initial = await views.next();
      expect(entityIds(initial)).toContain("alice");

      host.tick(1);
      const afterTick = await views.next();
      const entities = (afterTick!.serverState as WorldSnapshot)["entities"] as { id: string; position: number[] }[];
      expect(entities.find((e) => e.id === "alice")?.position[0]).toBeCloseTo(1);
    } finally {
      alice.close();
      router.close();
    }
  });

  test("loopback: a client's input frame reaches ctx.game.players over the ws stack", async () => {
    const { host, session } = sharedHost();
    const router = createHostRouter({ host, allowAnonymous: true });
    const alice = createWsBackend({ userId: "alice", pipe: loopbackPipe(router) });
    try {
      const { serverId } = await alice.transport.joinServer({ gameId: "shared" });
      const frame = { held: ["moveForward"], pointer: { x: 0, y: 1, active: true } };
      const result = await alice.transport.runCommand({ serverId, command: INPUT_COMMAND, input: frame });
      expect(result.ok).toBe(true);
      expect(session.runner().context().game.players?.input("alice")).toBeNull();
      host.tick(1 / 60);
      expect(session.runner().context().game.players?.input("alice")).toEqual(frame);
    } finally {
      alice.close();
      router.close();
    }
  });
});


describe("world capacity", () => {
  test("serialized concurrent admission caps players while permitting reconnect and spectators", async () => {
    const session = createHostedWorldSession({ definition: definition(), content: CONTENT });
    const host = createWorldGameHost({ session: () => session, slotsPerServer: 2 });
    await host.joinServer({ userId: "host", gameId: "shared" });
    const attempts = await Promise.allSettled([
      host.joinServer({ userId: "guest", gameId: "shared" }),
      host.joinServer({ userId: "third", gameId: "shared" }),
    ]);
    expect(attempts[0]?.status).toBe("fulfilled");
    expect(attempts[1]?.status).toBe("rejected");
    expect(session.members()).toEqual(["host", "guest"]);
    await host.joinServer({ userId: "guest", gameId: "shared" });
    await host.joinServer({ userId: "viewer", gameId: "shared", role: "spectator" });
    expect(session.members()).toEqual(["host", "guest"]);
    await host.leaveServer({ userId: "guest", serverId: "shared" });
    await host.joinServer({ userId: "third", gameId: "shared" });
    expect(session.members()).toEqual(["host", "third"]);
  });

  test("rejects invalid caps before opening a world", () => {
    for (const slotsPerServer of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => createWorldGameHost({ session: () => null, slotsPerServer })).toThrow("slotsPerServer");
    }
  });
});
