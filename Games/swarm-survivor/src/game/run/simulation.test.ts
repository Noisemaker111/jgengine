import { describe, expect, test } from "bun:test";

import { defineGame } from "@jgengine/core/game/defineGame";
import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { offline } from "@jgengine/core/runtime/adapter";

import { assets } from "../assets";
import { content } from "../content";
import { PLAYER_KIND } from "../entities/players/catalog";
import { LEVELING } from "../progression/curves";
import { physics, world } from "../../world";
import { chooseUpgrade, registerRunEvents, tickSimulation } from "./simulation";
import { getRunState, WIN_DURATION_SECONDS } from "./state";

function boot(): GameContext {
  const definition = defineGame({ name: "Swarm Survivor Test", assets, world, physics, multiplayer: offline() });
  const ctx = createGameContext({ definition, content, player: { userId: "p1", isNew: true } });
  ctx.scene.entity.spawn(PLAYER_KIND, { id: ctx.player.userId, position: [0, 0, 0] });
  ctx.scene.entity.stats.set(ctx.player.userId, "xp", { max: LEVELING.xpForLevel(1), current: 0 });
  ctx.scene.entity.stats.set(ctx.player.userId, "level", { current: 1 });
  registerRunEvents(ctx);
  return ctx;
}

function advance(ctx: GameContext, step: number): void {
  const gameDt = ctx.time.advance(step);
  tickSimulation(ctx, gameDt);
}

function advanceAuto(ctx: GameContext, step: number): void {
  advance(ctx, step);
  const run = getRunState(ctx);
  if (run.pendingOffers !== null) chooseUpgrade(ctx, run, run.pendingOffers[0]!.id);
}

function tickSeconds(ctx: GameContext, seconds: number, step = 0.1): void {
  let elapsed = 0;
  while (elapsed < seconds) {
    advanceAuto(ctx, step);
    elapsed += step;
  }
}

describe("swarm-survivor simulation", () => {
  test("spawn director places enemies into the scene over time", () => {
    const ctx = boot();
    tickSeconds(ctx, 15);
    const enemyCount = ctx.scene.entity.list().filter((entity) => entity.name !== PLAYER_KIND).length;
    expect(enemyCount).toBeGreaterThan(0);
  });

  test("killing an enemy drops an xp gem, credits a kill, and grants xp on pickup", () => {
    const ctx = boot();
    tickSeconds(ctx, 5);
    const run = getRunState(ctx);
    const enemy = ctx.scene.entity.list().find((entity) => entity.name !== PLAYER_KIND);
    expect(enemy).toBeDefined();
    const killsBefore = run.kills;
    ctx.scene.entity.effect({ from: ctx.player.userId, to: enemy!.id, effect: "hit", via: { amount: 100_000 } });
    expect(run.kills).toBe(killsBefore + 1);
    const gem = ctx.scene.worldItem.list().find((record) => record.baseType === "xp_gem");
    expect(gem).toBeDefined();
    ctx.scene.entity.setPose(gem!.instanceId, { position: [0, 0, 0] });
    const xpBefore = ctx.scene.entity.stats.get(ctx.player.userId, "xp")?.current ?? 0;
    advance(ctx, 0.1);
    const xpAfter = ctx.scene.entity.stats.get(ctx.player.userId, "xp")?.current ?? 0;
    expect(xpAfter).toBeGreaterThan(xpBefore);
  });

  test("leveling up pauses the run for an upgrade choice, and choosing one resumes it", () => {
    const ctx = boot();
    const run = getRunState(ctx);
    ctx.scene.entity.stats.set(ctx.player.userId, "xp", { current: LEVELING.xpForLevel(1) - 1 });
    ctx.scene.worldItem.spawn({ itemId: "xp_gem", baseType: "xp_gem", position: [0, 0, 0], count: 5, rarity: "common" });
    advance(ctx, 0.1);
    expect(run.pendingOffers).not.toBeNull();
    expect(ctx.time.isPaused()).toBe(true);
    const beforeLevel = run.weapons.pulseLance.level;
    chooseUpgrade(ctx, run, "focus_pulse_lance");
    expect(run.pendingOffers).toBeNull();
    expect(ctx.time.isPaused()).toBe(false);
    expect(run.weapons.pulseLance.level).toBeGreaterThan(beforeLevel);
  });

  test("contact damage from an adjacent enemy can end the run in defeat", () => {
    const ctx = boot();
    const run = getRunState(ctx);
    ctx.scene.entity.spawn("warden", { id: "brute", position: [0, 0, 0] });
    for (let i = 0; i < 50 && run.outcome === "playing"; i += 1) advanceAuto(ctx, 1);
    expect(run.outcome).toBe("lost");
  });

  test("enemy spawns and movement stay grounded to the ridged terrain", () => {
    const ctx = boot();
    tickSeconds(ctx, 6);
    const enemies = ctx.scene.entity.list().filter((entity) => entity.id !== ctx.player.userId);
    expect(enemies.length).toBeGreaterThan(0);
    for (const enemy of enemies) {
      expect(enemy.position[1]).toBeCloseTo(ctx.world.groundHeightAt(enemy.position[0], enemy.position[2]), 5);
    }
    expect(enemies.some((entity) => Math.abs(entity.position[1]) > 0.01)).toBe(true);
  });

  test("xp gems drop and get pulled at grounded terrain height", () => {
    const ctx = boot();
    tickSeconds(ctx, 6);
    const enemy = ctx.scene.entity.list().find((entity) => entity.id !== ctx.player.userId);
    expect(enemy).toBeDefined();
    ctx.scene.entity.effect({ from: ctx.player.userId, to: enemy!.id, effect: "hit", via: { amount: 100_000 } });
    const gem = ctx.scene.worldItem.list().find((record) => record.baseType === "xp_gem");
    expect(gem).toBeDefined();
    const gemEntity = ctx.scene.entity.get(gem!.instanceId);
    expect(gemEntity).not.toBeNull();
    expect(gemEntity!.position[1]).toBeCloseTo(ctx.world.groundHeightAt(gemEntity!.position[0], gemEntity!.position[2]), 5);
  });

  test("surviving the full timer ends the run in victory", () => {
    const ctx = boot();
    const run = getRunState(ctx);
    ctx.scene.entity.stats.set(ctx.player.userId, "health", { max: 1_000_000, current: 1_000_000 });
    let elapsed = 0;
    while (elapsed < WIN_DURATION_SECONDS + 1 && run.outcome === "playing") {
      advanceAuto(ctx, 1);
      elapsed += 1;
    }
    expect(run.outcome).toBe("won");
  });
});
