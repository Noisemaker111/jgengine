import { describe, expect, test } from "bun:test";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createGameRuntime } from "@jgengine/core/runtime/gameRuntime";
import { memoryWorldStore } from "@jgengine/core/runtime/hostedWorldSession";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { createGameServerFunctions } from "./server";
import { handlerOf, makeDb, serverDoc, type Doc } from "./testFixtures";
import {
  createHostedGameServerFunctions,
  invokeHostedWorld,
  type HostedGameConfig,
} from "./hostedServer";

function runtime() {
  return createGameRuntime({ gameId: "demo", save: "none", commands: {} });
}

describe("tickActiveServers scopes to the running partition", () => {
  test("ticks only running servers and never reads open/closed rows", async () => {
    const { db, reads, seed } = makeDb();
    const running = seed("jgGameServers", serverDoc({ _id: "srv:running", status: "running" }));
    const open = seed("jgGameServers", serverDoc({ _id: "srv:open", status: "open" }));
    const closed = seed("jgGameServers", serverDoc({ _id: "srv:closed", status: "closed" }));

    const fns = createGameServerFunctions({ runtimes: [runtime()], auth: "anonymous" });
    const result = (await handlerOf(fns.tickActiveServers)({ db }, {})) as {
      ticked: number;
      saved: number;
    };

    expect(result.ticked).toBe(1);
    expect(result.saved).toBe(0);
    expect(reads.has(running._id)).toBe(true);
    expect(reads.has(open._id)).toBe(false);
    expect(reads.has(closed._id)).toBe(false);
    expect((running.tickAnchorMs as number) > (open.tickAnchorMs as number)).toBe(true);
  });
});

describe("flushDirtyServers scopes to the dirty partition", () => {
  test("flushes only dirty servers and never reads clean rows", async () => {
    const { db, reads, seed } = makeDb();
    const dirty = seed(
      "jgGameServers",
      serverDoc({ _id: "srv:dirty", dirtyAt: Date.now(), revision: 3 }),
    );
    const clean = seed("jgGameServers", serverDoc({ _id: "srv:clean", dirtyAt: undefined }));

    const fns = createGameServerFunctions({ runtimes: [runtime()], auth: "anonymous" });
    const result = (await handlerOf(fns.flushDirtyServers)({ db }, {})) as { saved: number };

    expect(result.saved).toBe(1);
    expect(reads.has(dirty._id)).toBe(true);
    expect(reads.has(clean._id)).toBe(false);
  });
});

const HOSTED_CONTENT = {
  entityById: (catalogId: string) =>
    catalogId === "hero" ? { stats: { health: { max: 10 } } } : null,
};

function hostedGame(): HostedGameConfig {
  return {
    definition: defineGameDefinition({
      name: "Hosted Scope",
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
            if (!hero) continue;
            ctx.scene.entity.setPose(player.userId, { position: [hero.position[0] + dt, 0, 0] });
          }
        },
      },
    }),
    content: HOSTED_CONTENT,
  };
}

function hostedWorldDoc(overrides: Partial<Doc> & { _id: string }): Doc {
  const g = hostedGame();
  const store = memoryWorldStore();
  invokeHostedWorld({ game: g, store, op: (s) => s.join("alice", true) });
  const rec = store.load();
  const now = Date.now();
  return {
    _creationTime: now,
    gameId: "demo",
    serverId: overrides._id,
    snapshot: rec?.snapshot ?? {},
    revision: rec?.revision ?? 1,
    memberUserIds: ["alice"],
    inputs: {},
    tickAnchorMs: now - 5_000,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("tickHostedWorlds scopes to the due partition", () => {
  test("ticks only due worlds and never reads recently-ticked rows", async () => {
    const { db, reads, seed } = makeDb();
    const due = seed(
      "jgHostedWorlds",
      hostedWorldDoc({ _id: "srv:due", tickAnchorMs: Date.now() - 5_000 }),
    );
    const fresh = seed(
      "jgHostedWorlds",
      hostedWorldDoc({ _id: "srv:fresh", tickAnchorMs: Date.now() - 100 }),
    );

    const fns = createHostedGameServerFunctions({
      games: { demo: hostedGame() },
      auth: "anonymous",
      tickMs: 1_000,
    });
    const result = (await handlerOf(fns.tickHostedWorlds)({ db }, {})) as {
      ticked: number;
      saved: number;
    };

    expect(result.ticked).toBe(1);
    expect(reads.has(due._id)).toBe(true);
    expect(reads.has(fresh._id)).toBe(false);
    expect((due.revision as number) > 1).toBe(true);
    expect(fresh.revision).toBe(1);
  });
});
