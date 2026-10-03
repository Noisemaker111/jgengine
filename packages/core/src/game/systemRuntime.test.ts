import { describe, expect, test } from "bun:test";

import { createGameContext } from "../runtime/gameContext";
import { defineGameDefinition } from "./defineGame";
import { defineSystem, featuresFromSystems, mergeSystemFeatures } from "./defineSystem";
import { composeGameLoop, installSystems, systemsOf } from "./systemRuntime";

const definition = defineGameDefinition({ name: "SystemsTest", multiplayer: "off" as const });

function boot(systems: ReturnType<typeof defineSystem>[], loop?: Parameters<typeof composeGameLoop>[1]) {
  const game = defineGameDefinition({
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

  test("defineGameDefinition merges system features onto the definition", () => {
    const game = defineGameDefinition({
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

  test("disposal drains reverse system order and classic cleanup before rethrowing the first error", () => {
    const log: string[] = [];
    const first = new Error("last system failed");
    const { ctx, game } = boot([
      defineSystem({ id: "first", events: { "loot.granted": () => { log.push("event"); } }, dispose: () => { log.push("first"); } }),
      defineSystem({ id: "second", dispose: () => { log.push("second"); throw new Error("second failed"); } }),
      defineSystem({ id: "last", dispose: () => { log.push("last"); throw first; } }),
    ], { onDispose(context) { log.push("classic"); context.environment.dispose(); throw new Error("classic failed"); } });
    ctx.environment.watch({ id: "surface", x: 0, z: 0 });
    let caught: unknown;
    try { game.loop?.onDispose?.(ctx); } catch (error) { caught = error; }
    expect(caught).toBe(first);
    expect(log).toEqual(["last", "second", "first", "classic"]);
    expect(ctx.environment.snapshot().watched).toEqual([]);
    expect(systemsOf(ctx)).toBeUndefined();
    game.loop?.onDispose?.(ctx);
    ctx.game.events.emit("loot.granted", { userId: "p1", drops: [] });
    expect(log).toEqual(["last", "second", "first", "classic"]);
  });

  test("retirement is marked before reentrant system and classic callbacks", () => {
    const log: string[] = [];
    const game = defineGameDefinition({
      name: "Reentrant retirement", multiplayer: "off", persist: false,
      systems: [defineSystem({ id: "owned", dispose(ctx) { log.push("system"); game.loop?.onDispose?.(ctx); } })],
      loop: { onDispose(ctx) { log.push("classic"); game.loop?.onDispose?.(ctx); } },
    });
    const ctx = createGameContext({ definition: game, content: {}, player: { userId: "world", isNew: true } });
    game.loop?.onInit?.(ctx);
    game.loop?.onDispose?.(ctx);
    expect(log).toEqual(["system", "classic"]);
  });

  test("installed owner drains every callback once even when the first thrown value is undefined", () => {
    const ctx = createGameContext({ definition, content: {}, player: { userId: "world", isNew: true } });
    const log: string[] = [];
    const installed = installSystems(ctx, [
      defineSystem({ id: "first", dispose() { log.push("first"); } }),
      defineSystem({ id: "last", dispose() { log.push("last"); installed.dispose(ctx); throw undefined; } }),
    ]);
    let threw = false;
    let error: unknown = "not thrown";
    try { installed.dispose(ctx); } catch (caught) { threw = true; error = caught; }
    expect(threw).toBe(true);
    expect(error).toBeUndefined();
    installed.dispose(ctx);
    expect(log).toEqual(["last", "first"]);
  });

  test("classic disposal errors propagate after systems retire, without retrying either hook", () => {
    const first = new Error("classic failed");
    const log: string[] = [];
    const { ctx, game } = boot([defineSystem({ id: "owned", dispose() { log.push("system"); } })], {
      onDispose() { log.push("classic"); throw first; },
    });
    let caught: unknown;
    try { game.loop?.onDispose?.(ctx); } catch (error) { caught = error; }
    expect(caught).toBe(first);
    game.loop?.onDispose?.(ctx);
    expect(log).toEqual(["system", "classic"]);
  });

  test("retired installed handles cannot tick, reset or run manual work", () => {
    const ctx = createGameContext({ definition, content: {}, player: { userId: "world", isNew: true } });
    const log: string[] = [];
    const installed = installSystems(ctx, [
      defineSystem({ id: "frame", tick: { type: "frame" }, update() { log.push("tick"); }, reset() { log.push("reset"); } }),
      defineSystem({ id: "manual", tick: { type: "manual" }, update() { log.push("manual"); } }),
    ]);
    installed.dispose(ctx);
    installed.tick(ctx, 1);
    installed.reset(ctx);
    installed.runManual(ctx, "manual");
    expect(log).toEqual([]);
  });

  test("one definition keeps two worlds' schedules, reset hooks and listeners independent", () => {
    const ticks: string[] = [];
    const events: string[] = [];
    const resets: string[] = [];
    const disposed: string[] = [];
    const game = defineGameDefinition({ name: "Two worlds", multiplayer: "off", persist: false,
      systems: [defineSystem({ id: "owned", tick: { type: "interval", every: 1 },
        update(ctx) { ticks.push(ctx.player.userId); }, reset(ctx) { resets.push(ctx.player.userId); },
        events: { "loot.granted": ctx => { events.push(ctx.player.userId); } },
        dispose(ctx) { disposed.push(ctx.player.userId); },
      })],
    });
    const worlds = ["left", "right"].map(userId => createGameContext({ definition: game, content: {}, player: { userId, isNew: true } }));
    for (const ctx of worlds) game.loop?.onInit?.(ctx);
    for (const ctx of worlds) game.loop?.onTick?.(ctx, 0.5);
    expect(ticks).toEqual([]);
    for (const ctx of worlds) game.loop?.onTick?.(ctx, 0.5);
    expect(ticks).toEqual(["left", "right"]);
    game.loop?.onReset?.(worlds[0]!);
    expect(resets).toEqual(["left"]);
    game.loop?.onDispose?.(worlds[0]!);
    for (const ctx of worlds) ctx.game.events.emit("loot.granted", { userId: ctx.player.userId, drops: [] });
    expect(events).toEqual(["right"]);
    expect(disposed).toEqual(["left"]);
    expect(systemsOf(worlds[0]!)).toBeUndefined();
    expect(systemsOf(worlds[1]!)).toBeDefined();
    game.loop?.onTick?.(worlds[0]!, 1);
    expect(ticks).toEqual(["left", "right"]);
    game.loop?.onInit?.(worlds[0]!);
    worlds[0]!.game.events.emit("loot.granted", { userId: "left", drops: [] });
    expect(events).toEqual(["right", "left"]);
    for (const ctx of worlds) game.loop?.onDispose?.(ctx);
    expect(disposed).toEqual(["left", "left", "right"]);
  });

  test.each(["create", "module", "start"] as const)("failed %s installation drains acquired listeners and owners while preserving the startup error", (phase) => {
    const log: string[] = [];
    const failure = new Error(`${phase} failed`);
    const game = defineGameDefinition({ name: "Failed installation", multiplayer: "off", persist: false,
      systems: [
        defineSystem({ id: "first", events: { "loot.granted": () => { log.push("event"); } }, dispose() { log.push("first"); } }),
        defineSystem({ id: "failed", create() { if (phase === "create") throw failure; },
          save() { if (phase === "module") throw failure; return undefined; },
          start() { if (phase === "start") throw failure; },
          dispose() { log.push("failed"); throw new Error("cleanup failed"); },
        }),
        defineSystem({ id: "last", dispose() { log.push("last"); } }),
      ],
      loop: { onDispose(ctx) { log.push("classic"); ctx.environment.dispose(); } },
    });
    const ctx = createGameContext({ definition: game, content: {}, player: { userId: "world", isNew: true } });
    ctx.environment.watch({ id: "surface", x: 0, z: 0 });
    let caught: unknown;
    try { game.loop?.onInit?.(ctx); } catch (error) { caught = error; }
    expect(caught).toBe(failure);
    ctx.game.events.emit("loot.granted", { userId: "world", drops: [] });
    expect(log).toEqual(phase === "create" ? ["failed", "first"] : ["last", "failed", "first"]);
    expect(systemsOf(ctx)).toBeUndefined();
    game.loop?.onDispose?.(ctx);
    game.loop?.onDispose?.(ctx);
    expect(log.at(-1)).toBe("classic");
    expect(log.filter(entry => entry === "classic")).toHaveLength(1);
    expect(ctx.environment.snapshot().watched).toEqual([]);
  });
});
