import { describe, expect, test } from "bun:test";

import { defineGame } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import {
  createHostedWorldSession,
  type HostedWorldSession,
} from "@jgengine/core/runtime/hostedWorldSession";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { GameRuntimeServerView } from "@jgengine/core/runtime/transport";
import type { WorldSnapshot } from "@jgengine/core/runtime/worldSnapshot";
import { INPUT_COMMAND } from "@jgengine/core/runtime/hostedGameRunner";
import { createHostRouter, loopbackPipe } from "./hostRouter";
import { createWsBackend } from "./createWsBackend";
import { createWorldGameHost } from "./worldHost";

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
      alice.feeds?.subscribeServer(serverId, (view) => views.push(view));

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
      expect(session.runner().context().game.players?.input("alice")).toEqual(frame);
    } finally {
      alice.close();
      router.close();
    }
  });
});
