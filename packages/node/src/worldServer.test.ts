import { describe, expect, test } from "bun:test";

import { defineGame } from "@jgengine/core/game/defineGame";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { HostedWorldRecord, HostedWorldStore } from "@jgengine/core/runtime/hostedWorldSession";
import type { GameRuntimeServerView } from "@jgengine/core/runtime/transport";
import type { WorldSnapshot } from "@jgengine/core/runtime/worldSnapshot";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createWsBackend } from "@jgengine/ws/createWsBackend";
import type { WorldPersistence, WorldPersistenceKey } from "./persistence";
import { createWorldGameServer } from "./worldServer";

const CONTENT: GameContextContent = {
  entityById: (catalogId) => (catalogId === "hero" ? { stats: { health: { max: 10 } } } : null),
};

function definition() {
  return defineGame({
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

function heroX(view: GameRuntimeServerView | null): number | undefined {
  const entities = ((view?.serverState as WorldSnapshot | undefined)?.["entities"] ?? []) as {
    id: string;
    position: number[];
  }[];
  return entities.find((e) => e.id === "alice")?.position[0];
}

function server(now?: () => number, persistence?: WorldPersistence) {
  return createWorldGameServer({
    resolveGame: (gameId) => (gameId === "shared" ? { game: definition(), content: CONTENT } : null),
    allowAnonymous: true,
    port: 0,
    ...(now === undefined ? {} : { now }),
    ...(persistence === undefined ? {} : { persistence }),
  });
}

function spyPersistence() {
  const saves: { key: WorldPersistenceKey; record: HostedWorldRecord }[] = [];
  const persistence: WorldPersistence = {
    store(key) {
      const store: HostedWorldStore = {
        load: () => null,
        save: (record) => saves.push({ key, record }),
      };
      return store;
    },
  };
  return { persistence, saves };
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

describe("createWorldGameServer", () => {
  test("manual tick(dt) advances a hosted world; the ws server binds a port", async () => {
    const s = server();
    try {
      expect(s.port()).toBeGreaterThan(0);
      await s.host.joinServer({ userId: "alice", gameId: "shared" });
      s.tick(1);
      const view = await s.host.getServerView({ serverId: "shared" });
      expect(heroX(view)).toBeCloseTo(1);
      s.tick(0.5);
      expect(heroX(await s.host.getServerView({ serverId: "shared" }))).toBeCloseTo(1.5);
    } finally {
      await s.close();
    }
  });

  test("an unknown game id rejects the join", async () => {
    const s = server();
    try {
      await expect(s.host.joinServer({ userId: "alice", gameId: "unknown" })).rejects.toThrow();
    } finally {
      await s.close();
    }
  });

  test("a real ws client joins, and a tick's world advance replicates to it", async () => {
    const s = server();
    const alice = createWsBackend({ userId: "alice", url: `ws://localhost:${s.port()}/ws` });
    try {
      const { serverId } = await alice.transport.joinServer({ gameId: "shared" });
      const views = channel<GameRuntimeServerView | null>();
      alice.feeds?.subscribeServer(serverId, (view) => views.push(view));
      await views.next();
      s.tick(1);
      expect(heroX(await views.next())).toBeCloseTo(1);
    } finally {
      alice.close();
      await s.close();
    }
  });

  test("start()/stop() are idempotent and safe with no live worlds", async () => {
    const s = server();
    try {
      s.start();
      s.start();
      s.stop();
      s.stop();
      expect(s.port()).toBeGreaterThan(0);
    } finally {
      await s.close();
    }
  });

  test("an injected persistence adapter receives saves as a joined world ticks", async () => {
    const { persistence, saves } = spyPersistence();
    const s = server(undefined, persistence);
    try {
      await s.host.joinServer({ userId: "alice", gameId: "shared" });
      expect(saves.length).toBe(0);
      s.tick(1);
      expect(saves.length).toBe(1);
      expect(saves[0]?.key).toEqual({ gameId: "shared", serverId: "shared" });
      expect(saves[0]?.record.revision).toBeGreaterThan(0);
      s.tick(1);
      expect(saves.length).toBe(2);
    } finally {
      await s.close();
    }
  });

  test("flush() force-persists live worlds outside the tick cadence", async () => {
    const { persistence, saves } = spyPersistence();
    const s = server(undefined, persistence);
    try {
      await s.host.joinServer({ userId: "alice", gameId: "shared" });
      expect(saves.length).toBe(0);
      s.flush();
      expect(saves.length).toBe(1);
      s.flush();
      expect(saves.length).toBe(2);
    } finally {
      await s.close();
    }
  });

  test("close() flushes persistence before tearing down the ws server", async () => {
    const { persistence, saves } = spyPersistence();
    const s = server(undefined, persistence);
    await s.host.joinServer({ userId: "alice", gameId: "shared" });
    expect(saves.length).toBe(0);
    await s.close();
    expect(saves.length).toBe(1);
  });
});
