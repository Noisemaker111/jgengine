import { describe, expect, test } from "bun:test";

import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { entityCatalog, LIVES, MUNCHER, SCORE, START_LIVES } from "./catalog";
import { game } from "../game.config";
import {
  getFogFar,
  getForcefieldRemaining,
  getFrightenedRemaining,
  getLanternRemaining,
  getLevel,
  getPhase,
  getShells,
  ghostModeOf,
  MAX_LEVEL,
  onInit,
  onNewPlayer,
  onTick,
  pelletsLeft,
} from "../loop";
import { cellToWorld, GHOSTS, PLAYER_START, POWERUP_SPAWNS, pelletCells, powerCells } from "./maze";

const content = { entityById: (id: string) => entityCatalog(id) };
const STEP = 1 / 60;

function boot(): GameContext {
  game.game.scene.clear();
  const ctx = createGameContext({
    definition: game.game,
    content,
    player: { userId: "p1", isNew: true },
  });
  onInit(ctx);
  onNewPlayer(ctx);
  return ctx;
}

describe("maze-muncher world", () => {
  test("spawns the muncher and every ghost", () => {
    const ctx = boot();
    const entities = ctx.scene.entity.list();
    expect(entities.length).toBe(1 + GHOSTS.length);
    const names = new Set(entities.map((e) => e.name));
    expect(names.has(MUNCHER)).toBe(true);
    for (const ghost of GHOSTS) expect(names.has(ghost.kind)).toBe(true);
  });

  test("seeds the full dot count and starting lives", () => {
    const ctx = boot();
    expect(pelletsLeft()).toBe(pelletCells.length + powerCells.length);
    const lives = ctx.scene.entity.stats.get("p1", LIVES);
    const score = ctx.scene.entity.stats.get("p1", SCORE);
    expect(lives?.current).toBe(START_LIVES);
    expect(score?.current).toBe(0);
  });

  test("eating a dot scores points and clears it", () => {
    const ctx = boot();
    const before = pelletsLeft();
    const cell = pelletCells[0]!;
    const world = cellToWorld(cell.c, cell.r);
    ctx.scene.entity.setPose("p1", { position: world });
    onTick(ctx, STEP);
    expect(pelletsLeft()).toBe(before - 1);
    expect((ctx.scene.entity.stats.get("p1", SCORE)?.current ?? 0)).toBeGreaterThanOrEqual(10);
  });

  test("a power dot frightens the ghosts", () => {
    const ctx = boot();
    const cell = powerCells[0]!;
    const world = cellToWorld(cell.c, cell.r);
    ctx.scene.entity.setPose("p1", { position: world });
    onTick(ctx, STEP);
    expect(getFrightenedRemaining()).toBeGreaterThan(0);
    expect(ghostModeOf(GHOSTS[0]!.id)).toBe("frightened");
  });

  test("eating consecutive frightened ghosts scores a doubling chain", () => {
    const ctx = boot();
    const power = powerCells[0]!;
    ctx.scene.entity.setPose("p1", { position: cellToWorld(power.c, power.r) });
    onTick(ctx, STEP);
    const scoreAfterPower = ctx.scene.entity.stats.get("p1", SCORE)?.current ?? 0;

    const hunter = GHOSTS.find((g) => g.id === "hunter")!;
    const ambush = GHOSTS.find((g) => g.id === "ambush")!;
    ctx.scene.entity.setPose(hunter.id, { position: cellToWorld(power.c, power.r) });
    ctx.scene.entity.setPose("p1", { position: cellToWorld(power.c, power.r) });
    onTick(ctx, STEP);
    const scoreAfterFirstGhost = ctx.scene.entity.stats.get("p1", SCORE)?.current ?? 0;
    expect(scoreAfterFirstGhost - scoreAfterPower).toBe(200);

    ctx.scene.entity.setPose(ambush.id, { position: cellToWorld(power.c, power.r) });
    ctx.scene.entity.setPose("p1", { position: cellToWorld(power.c, power.r) });
    onTick(ctx, STEP);
    const scoreAfterSecondGhost = ctx.scene.entity.stats.get("p1", SCORE)?.current ?? 0;
    expect(scoreAfterSecondGhost - scoreAfterFirstGhost).toBe(400);
  });

  test("clearing every dot advances the level instead of ending the game", () => {
    const ctx = boot();
    for (const ghost of GHOSTS) ctx.scene.entity.despawn(ghost.id);
    for (const cell of [...pelletCells, ...powerCells]) {
      ctx.scene.entity.setPose("p1", { position: cellToWorld(cell.c, cell.r) });
      onTick(ctx, STEP);
    }
    expect(getPhase()).toBe("levelup");
    expect(getLevel()).toBe(2);

    for (let index = 0; index < 200; index += 1) onTick(ctx, STEP);
    expect(getPhase()).toBe("playing");
    expect(pelletsLeft()).toBe(pelletCells.length + powerCells.length);
  });

  test("clearing the final level wins the game", () => {
    const ctx = boot();
    for (const ghost of GHOSTS) ctx.scene.entity.despawn(ghost.id);
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      for (const cell of [...pelletCells, ...powerCells]) {
        ctx.scene.entity.setPose("p1", { position: cellToWorld(cell.c, cell.r) });
        onTick(ctx, STEP);
      }
      if (level < MAX_LEVEL) {
        for (let index = 0; index < 200; index += 1) onTick(ctx, STEP);
      }
    }
    expect(getPhase()).toBe("won");
    expect(getLevel()).toBe(MAX_LEVEL);
  });

  test("the restart command resets score, lives, level, and phase after a loss", () => {
    const ctx = boot();
    ctx.scene.entity.stats.set("p1", SCORE, { current: 4_200 });
    ctx.scene.entity.stats.set("p1", LIVES, { current: 0 });
    ctx.scene.entity.setPose(GHOSTS[0]!.id, { position: cellToWorld(PLAYER_START.c, PLAYER_START.r) });
    ctx.scene.entity.setPose("p1", { position: cellToWorld(PLAYER_START.c, PLAYER_START.r) });
    onTick(ctx, STEP);
    expect(getPhase()).toBe("lost");

    const result = ctx.game.commands.run("restart", {});
    expect(result.status).toBe("applied");
    expect(getPhase()).toBe("playing");
    expect(getLevel()).toBe(1);
    expect(ctx.scene.entity.stats.get("p1", SCORE)?.current).toBe(0);
    expect(ctx.scene.entity.stats.get("p1", LIVES)?.current).toBe(START_LIVES);
    expect(pelletsLeft()).toBe(pelletCells.length + powerCells.length);
  });
});

describe("maze-muncher powerups", () => {
  test("a force field repels a ghost instead of costing a life", () => {
    const ctx = boot();
    const field = POWERUP_SPAWNS.find((spawn) => spawn.kind === "forcefield")!;
    ctx.scene.entity.setPose("p1", { position: cellToWorld(field.c, field.r) });
    onTick(ctx, STEP);
    expect(getForcefieldRemaining()).toBeGreaterThan(0);

    const hunter = GHOSTS.find((g) => g.id === "hunter")!;
    ctx.scene.entity.setPose(hunter.id, { position: cellToWorld(field.c, field.r) });
    ctx.scene.entity.setPose("p1", { position: cellToWorld(field.c, field.r) });
    onTick(ctx, STEP);

    expect(getPhase()).toBe("playing");
    expect(ctx.scene.entity.stats.get("p1", LIVES)?.current).toBe(START_LIVES);
    expect(ghostModeOf(hunter.id)).toBe("eaten");
  });

  test("the double barrel arms shells and blasts a ghost in the aim cone", () => {
    const ctx = boot();
    const barrel = POWERUP_SPAWNS.find((spawn) => spawn.kind === "doublebarrel")!;
    ctx.scene.entity.setPose("p1", { position: cellToWorld(barrel.c, barrel.r) });
    onTick(ctx, STEP);
    const shells = getShells();
    expect(shells).toBeGreaterThan(0);

    const victim = GHOSTS[0]!;
    ctx.scene.entity.setPose(victim.id, { position: cellToWorld(barrel.c, barrel.r - 2) });
    const scoreBefore = ctx.scene.entity.stats.get("p1", SCORE)?.current ?? 0;
    ctx.game.commands.run("fire", { yaw: Math.PI });

    expect(getShells()).toBe(shells - 1);
    expect(ghostModeOf(victim.id)).toBe("eaten");
    expect(ctx.scene.entity.stats.get("p1", SCORE)?.current ?? 0).toBeGreaterThan(scoreBefore);
  });

  test("firing with no shells is a no-op", () => {
    const ctx = boot();
    expect(getShells()).toBe(0);
    const victim = GHOSTS[0]!;
    ctx.scene.entity.setPose("p1", { position: cellToWorld(PLAYER_START.c, PLAYER_START.r) });
    ctx.scene.entity.setPose(victim.id, { position: cellToWorld(PLAYER_START.c, PLAYER_START.r - 1) });
    ctx.game.commands.run("fire", { yaw: Math.PI });
    expect(ghostModeOf(victim.id)).not.toBe("eaten");
  });

  test("a lantern extends the fog view distance while it burns", () => {
    const ctx = boot();
    const baseFar = getFogFar();
    const lantern = POWERUP_SPAWNS.find((spawn) => spawn.kind === "lantern")!;
    ctx.scene.entity.setPose("p1", { position: cellToWorld(lantern.c, lantern.r) });
    onTick(ctx, STEP);
    expect(getLanternRemaining()).toBeGreaterThan(0);
    expect(getFogFar()).toBeGreaterThan(baseFar);
  });
});
