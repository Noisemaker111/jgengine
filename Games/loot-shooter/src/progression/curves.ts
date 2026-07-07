import { leveling, type LevelProgress } from "@jgengine/core/game/progression";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

export type { LevelProgress };

export const MAX_LEVEL = 30;
export const START_LEVEL = 1;

const track = leveling({
  xpForLevel: { kind: "power", base: 80, exponent: 1.4, round: "floor" },
  maxLevel: MAX_LEVEL,
  startLevel: START_LEVEL,
});

export const xpRequiredForLevel = track.xpForLevel;
export const resolveLevelProgress = track.resolve;

export function grantXp(ctx: GameContext, userId: string, amount: number): void {
  track.grantXp(ctx.scene.entity.stats, userId, amount, (level) =>
    ctx.game.events.emit("stat.levelUp", { userId, stat: "level", level }),
  );
}
