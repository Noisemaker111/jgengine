import { describe, expect, test } from "bun:test";

import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { entityById } from "./content";
import { game } from "./game.config";
import { onInit, onNewPlayer, onTick } from "./loop";
import {
  COIN_OBJECT,
  COINS,
  ENEMIES,
  GOAL_X,
  HAZARD_OBJECT,
  HAZARDS,
  MAX_HEALTH,
  SPAWN,
  STATUS_FEED,
} from "./tuning";

const content = { entityById };
const STEP = 1 / 60;

function boot(): GameContext {
  game.scene.clear();
  const ctx = createGameContext({
    definition: game,
    content,
    player: { userId: "p1", isNew: true },
  });
  onInit(ctx);
  onNewPlayer(ctx);
  return ctx;
}

describe("platform-hopper loop", () => {
  test("seeds every enemy, hazard, and coin", () => {
    const ctx = boot();
    const entities = ctx.scene.entity.list();
    expect(entities.filter((e) => e.role === "npc").length).toBe(ENEMIES.length);

    const objects = ctx.scene.object.list();
    expect(objects.filter((o) => o.catalogId === HAZARD_OBJECT).length).toBe(HAZARDS.length);
    expect(objects.filter((o) => o.catalogId === COIN_OBJECT).length).toBe(COINS.length);
  });

  test("stomping an enemy despawns it and scores a point", () => {
    const ctx = boot();
    const target = ENEMIES[0]!;
    ctx.scene.entity.setPose("p1", { position: [target.center, 1.2, 0] });
    ctx.scene.entity.setPose("p1", { position: [target.center, 0.9, 0], dt: STEP });

    onTick(ctx, STEP);

    expect(ctx.scene.entity.get(target.id)).toBeNull();
    expect(ctx.scene.entity.stats.get("p1", "score")?.current).toBe(1);
  });

  test("touching a spike hazard damages the player", () => {
    const ctx = boot();
    const hazard = HAZARDS[0]!;
    ctx.scene.entity.setPose("p1", { position: [hazard.x, 0, 0] });

    onTick(ctx, STEP);

    expect(ctx.scene.entity.stats.get("p1", "health")?.current).toBe(MAX_HEALTH - 1);
  });

  test("collecting a coin scores a point and removes it from the scene", () => {
    const ctx = boot();
    const coin = COINS[0]!;
    ctx.scene.entity.setPose("p1", { position: [coin.x, coin.y, 0] });

    onTick(ctx, STEP);

    expect(ctx.scene.entity.stats.get("p1", "score")?.current).toBe(1);
    const remaining = ctx.scene.object.list().filter((o) => o.catalogId === COIN_OBJECT);
    expect(remaining.length).toBe(COINS.length - 1);
  });

  test("reaching the goal line pushes a won result", () => {
    const ctx = boot();
    ctx.scene.entity.setPose("p1", { position: [GOAL_X - 1, 0, 0] });

    onTick(ctx, STEP);

    const results = ctx.game.feed.recent(STATUS_FEED).map((entry) => (entry.data as { result?: string }).result);
    expect(results).toContain("won");
  });

  test("death drops health to zero and pushes a lost result", () => {
    const ctx = boot();
    ctx.scene.entity.effect({ from: "p1", to: "p1", effect: "damage", via: { amount: MAX_HEALTH } });

    const results = ctx.game.feed.recent(STATUS_FEED).map((entry) => (entry.data as { result?: string }).result);
    expect(results).toContain("lost");
  });

  test("restart after death re-spawns the player entity", () => {
    const ctx = boot();
    ctx.scene.entity.effect({ from: "p1", to: "p1", effect: "damage", via: { amount: MAX_HEALTH } });
    expect(ctx.scene.entity.get("p1")).toBeNull();

    ctx.game.commands.run("restart", {});

    const player = ctx.scene.entity.get("p1");
    expect(player?.position).toEqual(SPAWN);
    expect(ctx.scene.entity.stats.get("p1", "health")?.current).toBe(MAX_HEALTH);
  });

  test("restart resets health, score, position, and coins", () => {
    const ctx = boot();
    const coin = COINS[0]!;
    ctx.scene.entity.setPose("p1", { position: [coin.x, coin.y, 0] });
    onTick(ctx, STEP);
    ctx.scene.entity.effect({ from: "p1", to: "p1", effect: "damage", via: { amount: 1 } });

    ctx.game.commands.run("restart", {});

    const player = ctx.scene.entity.get("p1");
    expect(player?.position).toEqual(SPAWN);
    expect(ctx.scene.entity.stats.get("p1", "health")?.current).toBe(MAX_HEALTH);
    expect(ctx.scene.entity.stats.get("p1", "score")?.current).toBe(0);
    const coinObjects = ctx.scene.object.list().filter((o) => o.catalogId === COIN_OBJECT);
    expect(coinObjects.length).toBe(COINS.length);
  });
});
