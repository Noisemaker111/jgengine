import { leveling, type LevelProgress } from "@jgengine/core/game/progression";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

export const MAX_CRED = 10;

const track = leveling({
  xpForLevel: { kind: "linear", base: 150, per: 130, round: "round" },
  maxLevel: MAX_CRED,
});

export type { LevelProgress };

export function credRequiredForLevel(level: number): number {
  return track.xpForLevel(level);
}

export function resolveCredProgress(level: number, xp: number): LevelProgress {
  return track.resolve(level, xp);
}

/** Cred paid per story mission on `quest.completed` — the story is the progression spine. */
export const CRED_BY_QUEST: Record<string, number> = {
  m1_welcome: 100,
  m2_dock_sweep: 220,
  m3_the_ledger: 300,
  m4_shake_the_heat: 340,
  m5_ocean_loop: 380,
  m6_hot_wheels: 420,
  m7_carmine_convoy: 520,
  m8_kingpin: 800,
};

export const BOUNTY_CRED = 140;
export const RACE_WIN_CRED = 150;

/** Cred level required to buy an item/vehicle; ids absent here are always in stock. */
export const CRED_GATES: Record<string, number> = {
  smg_carmine: 2,
  shotgun_boardwalk: 3,
  car_sport: 4,
};

export function credLevel(ctx: GameContext): number {
  return ctx.scene.entity.stats.get(ctx.player.userId, "level")?.current ?? 1;
}

export function grantCred(ctx: GameContext, amount: number): void {
  track.grantXp(
    {
      get: (id, stat) => ctx.scene.entity.stats.get(id, stat),
      set: (id, stat, patch) => ctx.scene.entity.stats.set(id, stat, patch),
    },
    ctx.player.userId,
    amount,
    (level) => {
      ctx.game.events.emit("stat.levelUp", { userId: ctx.player.userId, stat: "level", level });
      ctx.game.feed.push("vice.log", { text: `Street cred ${level} — new stock on the isle.` });
      ctx.scene.entity.floatText({ instanceId: ctx.player.userId, text: `CRED ${level}`, kind: "good" });
    },
  );
}
