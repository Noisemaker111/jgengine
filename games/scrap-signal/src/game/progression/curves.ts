import { leveling, type LevelProgress } from "@jgengine/core/game/progression";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

export const MAX_LEVEL = 30;

const track = leveling({
  xpForLevel: { kind: "power", base: 90, exponent: 1.75, round: "floor" },
  maxLevel: MAX_LEVEL,
});

export type { LevelProgress };

export function xpRequiredForLevel(level: number): number {
  return track.xpForLevel(level);
}

export function resolveLevelProgress(level: number, xp: number): LevelProgress {
  return track.resolve(level, xp);
}

export function grantXp(ctx: GameContext, userId: string, amount: number): void {
  track.grantXp(
    {
      get: (id, stat) => ctx.scene.entity.stats.get(id, stat),
      set: (id, stat, patch) => ctx.scene.entity.stats.set(id, stat, patch),
    },
    userId,
    amount,
    (level) => ctx.game.events.emit("stat.levelUp", { userId, stat: "level", level }),
  );
}
