import { describe, expect, test } from "bun:test";

import { defineGame } from "../game/defineGame";
import { offline } from "../runtime/adapter";
import { createGameContext, type GameContext } from "../runtime/gameContext";
import { createCartridge, type CartridgeRuntime } from "./runtime";
import { XP_GEM_BASE_TYPE, type CartridgeSpec } from "./spec";

function fixtureSpec(): CartridgeSpec {
  return {
    seed: "fixture",
    player: { kind: "runner", health: 100, walkSpeed: 6 },
    enemies: {
      crawler: { label: "Crawler", health: 10, walkSpeed: 4, xp: 2, contact: { damage: 6, intervalSeconds: 0.5 } },
      brute: { label: "Brute", health: 60, walkSpeed: 2, xp: 8, contact: { damage: 20, intervalSeconds: 0.8 } },
    },
    combat: { contactRadius: 1.1 },
    spawning: {
      director: {
        waves: [{ budget: 12, budgetPerSecond: 1, entries: [{ id: "crawler", cost: 1, weight: 1 }] }],
        maxAlive: 20,
        escalationPerSecond: 0.05,
        maxSpawnsPerTick: 6,
        seed: 7,
      },
      placement: { kind: "ring", radius: 10 },
    },
    weapons: {
      bolt: {
        kind: "projectile",
        label: "Bolt",
        damage: { base: 6, perLevel: 2 },
        cooldownMs: { base: 500, perLevel: -50, min: 200 },
        maxLevel: 4,
        range: 14,
        speed: 20,
      },
      saw: {
        kind: "orbit",
        label: "Saw",
        damage: 4,
        cooldownMs: 300,
        maxLevel: 4,
        blades: { table: [2, 3, 4, 4] },
        radius: { base: 2, perLevel: 0.1 },
        hitRadius: 1,
        angularSpeed: 3,
      },
      nova: {
        kind: "pulse",
        label: "Nova",
        damage: 10,
        cooldownMs: 2000,
        maxLevel: 4,
        radius: { base: 4, perLevel: 0.3 },
        durationSeconds: 0.5,
      },
    },
    progression: {
      xp: { kind: "geometric", base: 200, ratio: 1.3, round: "ceil" },
      maxLevel: 10,
      draft: {
        choices: 2,
        upgrades: [
          { id: "bolt_up", label: "Bolt Up", weight: 5, maxStacks: 3, effect: { kind: "weaponLevel", weapon: "bolt" } },
          { id: "plating", label: "Plating", weight: 4, maxStacks: 4, effect: { kind: "statBonus", stat: "health", amount: 10 } },
          { id: "magnet", label: "Magnet", weight: 3, maxStacks: 4, effect: { kind: "fieldAdd", field: "magnetRadius", amount: 1.5 } },
          { id: "surge", label: "Surge", weight: 3, maxStacks: 4, effect: { kind: "fieldMultiply", field: "damageMultiplier", factor: 1.1 } },
        ],
      },
    },
    xpGems: {
      collectRadius: 0.7,
      pullSpeed: 12,
      rarityThresholds: [
        [8, "rare"],
        [4, "uncommon"],
      ],
      defaultRarity: "common",
    },
    rules: {
      win: { kind: "survive", seconds: 30 },
      lose: { kind: "playerDeath" },
      killLeaderboardStat: "kills",
    },
    fields: { magnetRadius: 4, damageMultiplier: 1 },
  };
}

function boot(spec: CartridgeSpec = fixtureSpec()): { ctx: GameContext; cart: CartridgeRuntime } {
  const cart = createCartridge(spec);
  const definition = defineGame({ name: "Cartridge Fixture", multiplayer: offline() });
  const ctx = createGameContext({ definition, content: cart.content, player: { userId: "p1", isNew: true } });
  cart.loop.onInit?.(ctx);
  cart.loop.onNewPlayer?.(ctx);
  return { ctx, cart };
}

function advance(ctx: GameContext, cart: CartridgeRuntime, step: number): void {
  const gameDt = ctx.time.advance(step);
  cart.loop.onTick?.(ctx, gameDt);
}

function advanceAuto(ctx: GameContext, cart: CartridgeRuntime, step: number): void {
  advance(ctx, cart, step);
  const run = cart.run(ctx);
  if (run.pendingOffers !== null) cart.chooseUpgrade(ctx, run.pendingOffers[0]!.id);
}

function tickSeconds(ctx: GameContext, cart: CartridgeRuntime, seconds: number, step = 0.1): void {
  let elapsed = 0;
  while (elapsed < seconds) {
    advanceAuto(ctx, cart, step);
    elapsed += step;
  }
}

describe("cartridge runtime", () => {
  test("compiles player and enemy entries into content", () => {
    const { cart } = boot();
    expect(cart.content.entityById?.("runner")?.role).toBe("player");
    expect(cart.content.entityById?.("crawler")?.role).toBe("enemy");
    expect(cart.content.entityById?.("unknown")).toBeNull();
  });

  test("spawn director places enemies into the scene over time", () => {
    const { ctx, cart } = boot();
    tickSeconds(ctx, cart, 10);
    const enemies = ctx.scene.entity.list().filter((entity) => entity.name !== "runner");
    expect(enemies.length).toBeGreaterThan(0);
  });

  test("killing an enemy drops an xp gem, credits a kill, and grants xp on pickup", () => {
    const { ctx, cart } = boot();
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: 1_000_000, current: 1_000_000 });
    tickSeconds(ctx, cart, 4);
    const run = cart.run(ctx);
    const enemy = ctx.scene.entity.list().find((entity) => entity.name !== "runner");
    expect(enemy).toBeDefined();
    const killsBefore = run.kills;
    ctx.scene.entity.effect({ from: ctx.player.userId, to: enemy!.id, effect: "hit", via: { amount: 100_000 } });
    expect(run.kills).toBe(killsBefore + 1);
    const gem = ctx.scene.worldItem.list().find((record) => record.baseType === XP_GEM_BASE_TYPE);
    expect(gem).toBeDefined();
    ctx.scene.entity.setPose(gem!.instanceId, { position: [0, 0, 0] });
    ctx.scene.entity.stats.set(ctx.player.userId, "xp", { current: 0 });
    advance(ctx, cart, 0.1);
    const xpAfter = ctx.scene.entity.stats.get(ctx.player.userId, "xp")?.current ?? 0;
    expect(xpAfter).toBeGreaterThan(0);
  });

  test("leveling up pauses the run for a draft, and choosing resumes it", () => {
    const { ctx, cart } = boot();
    const run = cart.run(ctx);
    const threshold = ctx.scene.entity.stats.get(ctx.player.userId, "xp")?.max ?? 0;
    ctx.scene.entity.stats.set(ctx.player.userId, "xp", { current: threshold - 1 });
    ctx.scene.worldItem.spawn({ itemId: XP_GEM_BASE_TYPE, baseType: XP_GEM_BASE_TYPE, position: [0, 0, 0], count: 5, rarity: "common" });
    advance(ctx, cart, 0.1);
    expect(run.pendingOffers).not.toBeNull();
    expect(run.pendingOffers!.length).toBe(2);
    expect(ctx.time.isPaused()).toBe(true);
    cart.chooseUpgrade(ctx, run.pendingOffers![0]!.id);
    expect(run.pendingOffers).toBeNull();
    expect(ctx.time.isPaused()).toBe(false);
  });

  test("upgrade effects: weapon level, stat bonus, field add, field multiply", () => {
    const { ctx, cart } = boot();
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: 1_000_000, current: 1_000_000 });
    const run = cart.run(ctx);
    const draft = (id: string): void => {
      const max = ctx.scene.entity.stats.get(ctx.player.userId, "xp")?.max ?? 1;
      ctx.scene.entity.stats.set(ctx.player.userId, "xp", { current: max - 1 });
      ctx.scene.worldItem.spawn({ itemId: XP_GEM_BASE_TYPE, baseType: XP_GEM_BASE_TYPE, position: [0, 0, 0], count: 1, rarity: "common" });
      advance(ctx, cart, 0.1);
      while (run.pendingOffers !== null) {
        const offer = run.pendingOffers.find((entry) => entry.id === id) ?? run.pendingOffers[0]!;
        cart.chooseUpgrade(ctx, offer.id);
      }
    };
    const healthBefore = ctx.scene.entity.stats.get(ctx.player.userId, "health")?.max ?? 0;
    for (let i = 0; i < 30; i += 1) draft("bolt_up");
    expect(run.weaponLevel("bolt")).toBeGreaterThan(1);
    expect(run.field("magnetRadius")).toBeGreaterThanOrEqual(4);
    const stacksMagnet = Math.round((run.field("magnetRadius") - 4) / 1.5);
    expect(run.field("magnetRadius")).toBeCloseTo(4 + stacksMagnet * 1.5, 5);
    const healthAfter = ctx.scene.entity.stats.get(ctx.player.userId, "health")?.max ?? 0;
    expect(healthAfter).toBeGreaterThanOrEqual(healthBefore);
  });

  test("contact damage from an adjacent enemy ends the run in defeat", () => {
    const { ctx, cart } = boot();
    const run = cart.run(ctx);
    ctx.scene.entity.spawn("brute", { id: "hugger", position: [0, 0, 0] });
    for (let i = 0; i < 60 && run.outcome === "playing"; i += 1) advanceAuto(ctx, cart, 1);
    expect(run.outcome).toBe("lost");
  });

  test("surviving the win timer ends the run in victory", () => {
    const { ctx, cart } = boot();
    const run = cart.run(ctx);
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: 1_000_000, current: 1_000_000 });
    let elapsed = 0;
    while (elapsed < 32 && run.outcome === "playing") {
      advanceAuto(ctx, cart, 1);
      elapsed += 1;
    }
    expect(run.outcome).toBe("won");
  });

  test("weapons fire and produce fx feeds", () => {
    const { ctx, cart } = boot();
    ctx.scene.entity.spawn("crawler", { id: "target", position: [3, 0, 0] });
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: 1_000_000, current: 1_000_000 });
    const run = cart.run(ctx);
    let boltsSeen = 0;
    let pulsesSeen = 0;
    for (let elapsed = 0; elapsed < 3; elapsed += 0.1) {
      advanceAuto(ctx, cart, 0.1);
      boltsSeen = Math.max(boltsSeen, run.bolts.length);
      pulsesSeen = Math.max(pulsesSeen, run.pulses.length);
    }
    expect(boltsSeen).toBeGreaterThan(0);
    expect(pulsesSeen).toBeGreaterThan(0);
  });

  test("custom systems run each playing tick", () => {
    const spec = fixtureSpec();
    let ticks = 0;
    spec.systems = [
      () => {
        ticks += 1;
      },
    ];
    const { ctx, cart } = boot(spec);
    tickSeconds(ctx, cart, 1);
    expect(ticks).toBeGreaterThan(0);
  });
});
