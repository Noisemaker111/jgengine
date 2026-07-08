import type { GameContext } from "@jgengine/core/runtime/gameContext";

export const MAX_LEVEL = 30;
export const START_LEVEL = 1;

export function xpRequiredForLevel(level: number): number {
  return Math.floor(80 * level ** 1.4);
}

export interface LevelProgress {
  level: number;
  xp: number;
  xpMax: number;
  levelsGained: number;
}

export function resolveLevelProgress(level: number, xp: number): LevelProgress {
  let currentLevel = level;
  let currentXp = xp;
  let levelsGained = 0;
  while (currentLevel < MAX_LEVEL && currentXp >= xpRequiredForLevel(currentLevel)) {
    currentXp -= xpRequiredForLevel(currentLevel);
    currentLevel += 1;
    levelsGained += 1;
  }
  if (currentLevel >= MAX_LEVEL) currentXp = 0;
  return {
    level: currentLevel,
    xp: currentXp,
    xpMax: xpRequiredForLevel(Math.min(currentLevel, MAX_LEVEL)),
    levelsGained,
  };
}

export function grantXp(ctx: GameContext, userId: string, amount: number): void {
  const xp = ctx.scene.entity.stats.get(userId, "xp");
  const level = ctx.scene.entity.stats.get(userId, "level");
  if (xp === null || level === null) return;
  const progress = resolveLevelProgress(level.current, xp.current + amount);
  ctx.scene.entity.stats.set(userId, "xp", { current: progress.xp, max: progress.xpMax });
  if (progress.levelsGained > 0) {
    ctx.scene.entity.stats.set(userId, "level", { current: progress.level });
    ctx.game.events.emit("stat.levelUp", { userId, stat: "level", level: progress.level });
  }
}
