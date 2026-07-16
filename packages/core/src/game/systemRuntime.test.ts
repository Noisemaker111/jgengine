import { describe, expect, test } from "bun:test";

import { createGameContext } from "../runtime/gameContext";
import { defineGame } from "./defineGame";
import { defineSystem, featuresFromSystems, mergeSystemFeatures } from "./defineSystem";
import { composeGameLoop, installSystems, systemsOf } from "./systemRuntime";

const definition = defineGame({ name: "SystemsTest", multiplayer: "off" as const });

function boot(systems: ReturnType<typeof defineSystem>[], loop?: Parameters<typeof composeGameLoop>[1]) {
  const game = defineGame({
    name: "SystemsTest",
    multiplayer: "off" as const,
    systems,
    loop,
  });
  const ctx = createGameContext({
    definition: game,
    content: {},
    player: { userId: "p1", isNew: true },
  });
  game.loop?.onInit?.(ctx);
  return { ctx, game };
}

describe("featuresFromSystems / mergeSystemFeatures", () => {
  test("installing a system activates its feature without a redundant flag", () => {
    const systems = [
      defineSystem({ id: "quests", feature: "quest", tick: { type: "manual" } }),
      defineSystem({ id: "shop", feature: ["trade", "unlocks"], tick: { type: "manual" } }),
    ];
    expect(featuresFromSystems(systems)).toEqual({
      quest: true,
      trade: true,
      unlocks: true,
    });
    expect(mergeSystemFeatures({ chat: true }, systems)).toEqual({
      chat: true,
      quest: true,
      trade: true,
      unlocks: true,
    });
  });

  test("defineGame merges system features onto the definition", () => {
    const game = defineGame({
      name: "Feat",
      multiplayer: "off" as const,
      systems: [defineSystem({ id: "q", feature: "quest", tick: { type: "manual" } })],
    });
    expect(game.features?.quest).toBe(true);
    const ctx = createGameContext({
      definition: game,
      content: {},
      player: { userId: "p", isNew: true },
    });
    expect(ctx.game.quest).toBeDefined();
  });
});

describe("composeGameLoop / installSystems", () => {
  test("deterministic multi-subscribe frame order", () => {
    const order: string[] = [];
    const { ctx, game } = boot([
      defineSystem({
        id: "b",
        tick: { type: "frame", stage: "effects" },
        update: () => {
          order.push("b");
        },
      }),
      defineSystem({
        id: "a",
        tick: { type: "frame", stage: "animation" },
        update: () => {
          order.push("a");
        },
      }),
      defineSystem({
        id: "c",
        tick: { type: "frame", stage: "effects", after: "b" },
        update: () => {
          order.push("c");
        },
      }),
    ]);
    game.loop?.onTick?.(ctx, 1 / 60);
    expect(order).toEqual(["a", "b", "c"]);
  });

  test("fixed rate steps use fixed dt and accumulator", () => {
    const steps: number[] = [];
    const { ctx, game } = boot([
      defineSystem({
        id: "sim",
        tick: { type: "fixed", rate: 10 },
        update: (_ctx, dt) => {
          steps.push(dt);
        },
      }),
    ]);
    game.loop?.onTick?.(ctx, 0.25);
    expect(steps).toEqual([0.1, 0.1]);
  });

  test("interval systems fire on their own period", () => {
    let fires = 0;
    const { ctx, game } = boot([
      defineSystem({
        id: "pulse",
        tick: { type: "interval", every: 0.5 },
        update: () => {
          fires += 1;
        },
      }),
    ]);
    game.loop?.onTick?.(ctx, 0.4);
    expect(fires).toBe(0);
    game.loop?.onTick?.(ctx, 0.2);
    expect(fires).toBe(1);
  });

  test("event-only systems subscribe without ticking", () => {
    const seen: string[] = [];
    const { ctx, game } = boot([
      defineSystem({
        id: "xp",
        events: {
          "stat.levelUp": (_ctx, event) => {
            seen.push((event as { userId: string }).userId);
          },
        },
      }),
    ]);
    game.loop?.onTick?.(ctx, 1);
    expect(seen).toEqual([]);
    ctx.game.events.emit("stat.levelUp", { userId: "p1", stat: "level", level: 2 });
    expect(seen).toEqual(["p1"]);
  });

  test("classic loop still runs after systems (incremental migration)", () => {
    const order: string[] = [];
    const { ctx, game } = boot(
      [
        defineSystem({
          id: "sys",
          tick: { type: "frame" },
          update: () => {
            order.push("sys");
          },
        }),
      ],
      {
        onTick: () => {
          order.push("loop");
        },
      },
    );
    game.loop?.onTick?.(ctx, 0.016);
    expect(order).toEqual(["sys", "loop"]);
  });

  test("systems own save and replication modules", () => {
    let value = 0;
    const { ctx, game } = boot([
      defineSystem({
        id: "counter",
        tick: { type: "manual" },
        create() {
          value = 1;
        },
        save: {
          key: "counter",
          snapshot: () => value,
          hydrate: (data) => {
            value = data as number;
          },
        },
        replicate: {
          key: "counter-rep",
          snapshot: () => value,
          hydrate: (data) => {
            value = data as number;
          },
        },
      }),
    ]);
    expect(value).toBe(1);
    const snap = ctx.snapshot();
    expect(snap["counter-rep"]).toBe(1);
    value = 99;
    ctx.hydrate({ "counter-rep": 3 });
    expect(value).toBe(3);
    void game;
  });

  test("reset and dispose run system hooks", () => {
    const log: string[] = [];
    const { ctx, game } = boot([
      defineSystem({
        id: "life",
        tick: { type: "manual" },
        reset: () => {
          log.push("reset");
        },
        dispose: () => {
          log.push("dispose");
        },
      }),
    ]);
    game.loop?.onReset?.(ctx);
    game.loop?.onDispose?.(ctx);
    expect(log).toEqual(["reset", "dispose"]);
    expect(systemsOf(ctx)).toBeUndefined();
  });

  test("installSystems exposes schedule for diagnostics", () => {
    const ctx = createGameContext({
      definition,
      content: {},
      player: { userId: "p", isNew: true },
    });
    const installed = installSystems(ctx, [
      defineSystem({ id: "a", tick: { type: "frame" } }),
      defineSystem({ id: "b", tick: { type: "frame", after: "a" } }),
    ]);
    expect(installed.schedule.frameOrder).toEqual(["a", "b"]);
  });
});
