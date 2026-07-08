import { describe, expect, test } from "bun:test";

import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";

import { entityCatalog, LIVES, MUNCHER, SCORE, START_LIVES } from "./catalog";
import { game } from "./game.config";
import {
  getFrightenedRemaining,
  ghostModeOf,
  onInit,
  onNewPlayer,
  onTick,
  pelletsLeft,
} from "./loop";
import { cellToWorld, GHOSTS, pelletCells, powerCells } from "./maze";

const content = { entityById: (id: string) => entityCatalog[id] ?? null };
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
});
