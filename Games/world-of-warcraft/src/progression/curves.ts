import { leveling, type LevelProgress } from "@jgengine/core/game/progression";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

export type { LevelProgress };

export const CHARACTER_MAX_LEVEL = 60;
export const CHARACTER_START_LEVEL = 1;

const track = leveling({
  xpForLevel: { kind: "power", base: 100, exponent: 1.55, round: "floor" },
  maxLevel: CHARACTER_MAX_LEVEL,
  startLevel: CHARACTER_START_LEVEL,
});

export const xpRequiredForLevel = track.xpForLevel;
export const resolveLevelProgress = track.resolve;

function emitLevelUp(ctx: GameContext, userId: string): (level: number) => void {
  return (level) => ctx.game.events.emit("stat.levelUp", { userId, stat: "level", level });
}

export function applyLevelUps(ctx: GameContext, userId: string): number {
  return track.grantXp(ctx.scene.entity.stats, userId, 0, emitLevelUp(ctx, userId));
}

export function grantXp(ctx: GameContext, userId: string, amount: number): void {
  track.grantXp(ctx.scene.entity.stats, userId, amount, emitLevelUp(ctx, userId));
}
