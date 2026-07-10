import { describe, expect, test } from "bun:test";

import { defineGame, type PhysicsConfig } from "../game/defineGame";
import { offline } from "../runtime/adapter";
import { createGameContext, type GameContext } from "../runtime/gameContext";
import { summarizeEnvironment } from "../world/environmentSummary";
import type { WorldFeature } from "../world/features";
import { createCartridge, type CartridgeRuntime } from "./runtime";
import { XP_GEM_BASE_TYPE, type CartridgeSpec } from "./spec";
import { validateCartridge } from "./validate";

export interface CartridgeSmokeOptions {
  simulateSeconds?: number;
}

export function bootCartridge(
  spec: CartridgeSpec & { name?: string; world?: WorldFeature; physics?: PhysicsConfig },
): { ctx: GameContext; cart: CartridgeRuntime } {
  const cart = createCartridge(spec);
  const definition = defineGame({
    name: spec.name ?? "Cartridge Test",
    world: spec.world,
    physics: spec.physics,
    multiplayer: offline(),
  });
  const ctx = createGameContext({ definition, content: cart.content, player: { userId: "p1", isNew: true } });
  cart.loop.onInit?.(ctx);
  cart.loop.onNewPlayer?.(ctx);
  cart.begin(ctx);
  return { ctx, cart };
}

export function tickCartridge(ctx: GameContext, cart: CartridgeRuntime, seconds: number, step = 0.1): void {
  let elapsed = 0;
  while (elapsed < seconds) {
    const dt = ctx.time.advance(step);
    cart.loop.onTick?.(ctx, dt);
    const run = cart.run(ctx);
    if (run.pendingOffers !== null) cart.chooseUpgrade(ctx, run.pendingOffers[0]!.id);
    elapsed += step;
  }
}

export function cartridgeSmokeTest(
  spec: CartridgeSpec & { name?: string; world?: WorldFeature; physics?: PhysicsConfig },
  options?: CartridgeSmokeOptions,
): void {
  const seconds = options?.simulateSeconds ?? 10;

  describe(`${spec.name ?? "cartridge"} smoke`, () => {
    test("spec validates clean", () => {
      expect(validateCartridge(spec)).toEqual([]);
    });

    if (spec.world !== undefined) {
      test("world renders a populated scene", () => {
        expect(summarizeEnvironment(spec.world!).isEmpty).toBe(false);
      });
    }

    test(`a head-less run survives ${seconds}s: player alive, enemies spawn, kills drop gems`, () => {
      const { ctx, cart } = bootCartridge(spec);
      ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: 1_000_000, current: 1_000_000 });
      tickCartridge(ctx, cart, seconds);
      expect(ctx.scene.entity.get(ctx.player.userId)).not.toBeNull();
      const enemies = ctx.scene.entity.list().filter((entity) => spec.enemies[entity.name] !== undefined);
      expect(enemies.length).toBeGreaterThan(0);
      const run = cart.run(ctx);
      const killsBefore = run.kills;
      ctx.scene.entity.effect({ from: ctx.player.userId, to: enemies[0]!.id, effect: "hit", via: { amount: 100_000 } });
      expect(run.kills).toBe(killsBefore + 1);
      expect(ctx.scene.worldItem.list().some((record) => record.baseType === XP_GEM_BASE_TYPE)).toBe(true);
    });
  });
}
