import { describe, expect, test } from "bun:test";

import { bootCartridge, cartridgeSmokeTest, tickCartridge } from "@jgengine/core/cartridge/testkit";
import { summarizeEnvironment } from "@jgengine/core/world/environmentSummary";

import { config } from "../game.config";

cartridgeSmokeTest(config, { simulateSeconds: 12 });

describe("swarm-survivor world", () => {
  test("ridged arena with weather and ruins", () => {
    const summary = summarizeEnvironment(config.world!);
    expect(summary.counts.terrain).toBe(1);
    expect(summary.terrain?.height.finite).toBe(true);
    expect(summary.counts.buildings).toBeGreaterThan(0);
    expect(summary.counts.weatherSystems).toBe(1);
    expect(summary.counts.vegetationFields).toBe(1);
  });

  test("enemies stay grounded to the terrain", () => {
    const { ctx, cart } = bootCartridge(config);
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: 1_000_000, current: 1_000_000 });
    tickCartridge(ctx, cart, 8);
    const enemies = ctx.scene.entity.list().filter((entity) => config.enemies[entity.name] !== undefined);
    expect(enemies.length).toBeGreaterThan(0);
    for (const enemy of enemies) {
      expect(enemy.position[1]).toBeCloseTo(ctx.world.groundHeightAt(enemy.position[0], enemy.position[2]), 5);
    }
  });
});
