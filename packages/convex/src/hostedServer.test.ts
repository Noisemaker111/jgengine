import { describe, expect, test } from "bun:test";

import { defineGame } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { memoryWorldStore, type HostedWorldStore } from "@jgengine/core/runtime/hostedWorldSession";
import { diffSnapshots } from "@jgengine/core/runtime/worldReplication";
import type { GameContext, GameContextContent } from "@jgengine/core/runtime/gameContext";
import type { WorldSnapshot } from "@jgengine/core/runtime/worldSnapshot";
import {
  createHostedGameServerFunctions,
  invokeHostedWorld,
  type HostedGameConfig,
} from "./hostedServer";

const CONTENT: GameContextContent = {
  entityById: (catalogId) => (catalogId === "hero" ? { stats: { health: { max: 10 } } } : null),
};

function game(): HostedGameConfig {
  return {
    definition: defineGame({
      name: "Hosted Convex",
      assets: createAssetCatalog(),
      multiplayer: "off",
      features: { players: true },
      loop: {
        onInit(ctx: GameContext) {
          ctx.game.commands.define<{ by: number }>("bump", {
            apply(state, input) {
              const prev = (state.game.store.get("bumped") as number | undefined) ?? 0;
              state.game.store.set("bumped", prev + input.by);
            },
          });
        },
        onNewPlayer(ctx: GameContext, player) {
          ctx.scene.entity.spawn("hero", { id: player!.userId, position: [0, 0, 0] });
        },
        onTick(ctx: GameContext, dt) {
          for (const player of ctx.game.players?.list() ?? []) {
            const hero = ctx.scene.entity.get(player.userId);
            if (!hero) continue;
            const speed = player.input?.held.includes("moveForward") ? 10 : 1;
            ctx.scene.entity.setPose(player.userId, {
              position: [hero.position[0] + dt * speed, 0, 0],
            });
          }
        },
        onPlayerLeave(ctx: GameContext, player) {
          ctx.scene.entity.despawn(player.userId);
        },
      },
    }),
    content: CONTENT,
  };
}

function heroX(store: HostedWorldStore, userId: string): number | undefined {
  const snapshot = store.load()?.snapshot as WorldSnapshot | undefined;
  const entities = (snapshot?.["entities"] ?? []) as { id: string; position: number[] }[];
  return entities.find((e) => e.id === userId)?.position[0];
}

describe("invokeHostedWorld", () => {
  test("state accumulates across fresh reconstructions sharing one store", () => {
    const g = game();
    const store = memoryWorldStore();

    const join = invokeHostedWorld({ game: g, store, op: (s) => s.join("alice", true) });
    expect(join.changed).toBe(true);
    expect(join.revision).toBe(1);
    expect(join.members).toEqual(["alice"]);
    expect(heroX(store, "alice")).toBeCloseTo(0);

    const tick1 = invokeHostedWorld({
      game: g,
      store,
      members: join.members,
      op: (s) => s.tick(1),
    });
    expect(tick1.changed).toBe(true);
    expect(tick1.revision).toBe(2);
    expect(heroX(store, "alice")).toBeCloseTo(1);

    const command = invokeHostedWorld({
      game: g,
      store,
      members: join.members,
      op: (s) => s.command("alice", "bump", { by: 3 }),
    });
    expect(command.value.status).toBe("applied");
    expect(command.revision).toBe(3);
    expect(store.load()?.snapshot["store"]).toContainEqual(["bumped", 3]);

    const before = store.load();
    const tick2 = invokeHostedWorld({
      game: g,
      store,
      members: join.members,
      op: (s) => s.tick(2),
    });
    expect(tick2.revision).toBe(4);
    expect(heroX(store, "alice")).toBeCloseTo(3);

    const after = store.load();
    const diff = diffSnapshots(before!.snapshot, after!.snapshot, after!.revision);
    expect(diff.revision).toBe(4);
    expect(diff.entities.length).toBeGreaterThan(0);
    expect(diff.entities.some((e) => e.id === "alice")).toBe(true);
  });

  test("held inputs replay onto a reconstructed session before the op", () => {
    const g = game();
    const store = memoryWorldStore();
    const join = invokeHostedWorld({ game: g, store, op: (s) => s.join("alice", true) });

    const tick = invokeHostedWorld({
      game: g,
      store,
      members: join.members,
      inputs: { alice: { held: ["moveForward"], pointer: null } },
      op: (s) => s.tick(1),
    });
    expect(tick.changed).toBe(true);
    expect(heroX(store, "alice")).toBeCloseTo(10);
  });

  test("an unchanged invocation neither bumps the revision nor saves", () => {
    const g = game();
    const store = memoryWorldStore();
    const join = invokeHostedWorld({ game: g, store, op: (s) => s.join("alice", true) });
    const savedBefore = store.load();

    const tick = invokeHostedWorld({
      game: g,
      store,
      members: join.members,
      op: (s) => s.tick(0),
    });
    expect(tick.changed).toBe(false);
    expect(tick.revision).toBe(join.revision);
    expect(store.load()).toBe(savedBefore);
  });

  test("a reconstructed leave fires onPlayerLeave and despawns the member", () => {
    const g = game();
    const store = memoryWorldStore();
    const join = invokeHostedWorld({ game: g, store, op: (s) => s.join("alice", true) });
    invokeHostedWorld({ game: g, store, members: join.members, op: (s) => s.tick(1) });

    const leave = invokeHostedWorld({
      game: g,
      store,
      members: join.members,
      op: (s) => s.leave("alice"),
    });
    expect(leave.changed).toBe(true);
    expect(leave.members).toEqual([]);
    expect(heroX(store, "alice")).toBeUndefined();
  });

  test("rejected commands leave the store untouched", () => {
    const g = game();
    const store = memoryWorldStore();
    const join = invokeHostedWorld({ game: g, store, op: (s) => s.join("alice", true) });
    const savedBefore = store.load();

    const unknown = invokeHostedWorld({
      game: g,
      store,
      members: join.members,
      op: (s) => s.command("alice", "no-such-command", {}),
    });
    expect(unknown.value.status).toBe("unknown-command");
    expect(unknown.changed).toBe(false);
    expect(store.load()).toBe(savedBefore);
  });

  test("a second player joins an already-reconstructed world without disturbing the first", () => {
    const g = game();
    const store = memoryWorldStore();
    const first = invokeHostedWorld({ game: g, store, op: (s) => s.join("alice", true) });
    invokeHostedWorld({ game: g, store, members: first.members, op: (s) => s.tick(2) });

    const second = invokeHostedWorld({
      game: g,
      store,
      members: first.members,
      op: (s) => s.join("bob", true),
    });
    expect(second.members).toEqual(["alice", "bob"]);
    expect(heroX(store, "alice")).toBeCloseTo(2);
    expect(heroX(store, "bob")).toBeCloseTo(0);
  });
});

describe("createHostedGameServerFunctions", () => {
  test("returns the full hosted function surface", () => {
    const functions = createHostedGameServerFunctions({
      games: { demo: game() },
      auth: "anonymous",
    });
    expect(Object.keys(functions).sort()).toEqual([
      "getHostedServer",
      "joinHostedServer",
      "leaveHostedServer",
      "runHostedCommand",
      "submitHostedInput",
      "tickHostedWorlds",
    ]);
    for (const fn of Object.values(functions)) expect(fn).toBeDefined();
  });
});
