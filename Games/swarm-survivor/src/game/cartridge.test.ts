import { describe, expect, test } from "bun:test";

import { createCartridge } from "@jgengine/core/cartridge/runtime";
import { validateCartridge } from "@jgengine/core/cartridge/validate";
import { defineGame } from "@jgengine/core/game/defineGame";
import { offline } from "@jgengine/core/runtime/adapter";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { config } from "../game.config";

describe("swarm-survivor cartridge", () => {
  test("spec validates clean", () => {
    expect(validateCartridge(config)).toEqual([]);
  });

  test("world renders a populated ridged arena with weather and ruins", () => {
    const summary = summarizeEnvironment(config.world!);
    expect(summary.isEmpty).toBe(false);
    expect(summary.counts.terrain).toBe(1);
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.counts.buildings).toBeGreaterThan(0);
    expect(summary.counts.weatherSystems).toBe(1);
    expect(summary.counts.vegetationFields).toBe(1);
  });

  test("a head-less run spawns swarmers, drops gems on kills, and stays grounded", () => {
    const cart = createCartridge(config);
    const definition = defineGame({ name: "Swarm Survivor Test", world: config.world, physics: config.physics, multiplayer: offline() });
    const ctx: GameContext = createGameContext({ definition, content: cart.content, player: { userId: "p1", isNew: true } });
    cart.loop.onInit?.(ctx);
    cart.loop.onNewPlayer?.(ctx);
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: 1_000_000, current: 1_000_000 });

    let elapsed = 0;
    while (elapsed < 12) {
      const dt = ctx.time.advance(0.1);
      cart.loop.onTick?.(ctx, dt);
      const run = cart.run(ctx);
      if (run.pendingOffers !== null) cart.chooseUpgrade(ctx, run.pendingOffers[0]!.id);
      elapsed += 0.1;
    }

    const enemies = ctx.scene.entity.list().filter((entity) => config.enemies[entity.name] !== undefined);
    expect(enemies.length).toBeGreaterThan(0);
    for (const enemy of enemies) {
      expect(enemy.position[1]).toBeCloseTo(ctx.world.groundHeightAt(enemy.position[0], enemy.position[2]), 5);
    }

    const run = cart.run(ctx);
    const killsBefore = run.kills;
    ctx.scene.entity.effect({ from: ctx.player.userId, to: enemies[0]!.id, effect: "hit", via: { amount: 100_000 } });
    expect(run.kills).toBe(killsBefore + 1);
    expect(ctx.scene.worldItem.list().some((record) => record.baseType === "xp_gem")).toBe(true);
  });
});
