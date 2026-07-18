import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { bonus } from "../characters";
import { ffylStore } from "../stores";

export type FfylPhase = "up" | "downed" | "dead";

export interface FfylState {
  phase: FfylPhase;
  downedUntilMs: number;
}

/** Per-session Fight-For-Your-Life state — reclaimed with the context (#632). */
const ffylOf = perContext(() => ({ phase: "up" as FfylPhase, downedUntilMs: 0 }));

export const FFYL_WINDOW_MS = 12000;
export const SECOND_WIND_HEALTH_FRACTION = 0.4;
export const RESPAWN_CASH_FRACTION = 0.07;

export function ffylPhase(ctx: GameContext): FfylPhase {
  return ffylOf(ctx).phase;
}

export function enterDowned(ctx: GameContext, nowMs: number): void {
  const ffyl = ffylOf(ctx);
  ffyl.phase = "downed";
  ffyl.downedUntilMs = nowMs + FFYL_WINDOW_MS * (1 + bonus("ffylTime"));
  ffylStore.write(ctx, { phase: "downed", untilMs: ffyl.downedUntilMs });
}

export function secondWind(ctx: GameContext): void {
  const userId = ctx.player.userId;
  ffylOf(ctx).phase = "up";
  const health = ctx.scene.entity.stats.get(userId, "health");
  if (health !== null) {
    const fraction = SECOND_WIND_HEALTH_FRACTION * (1 + bonus("secondWindHeal"));
    ctx.scene.entity.stats.delta(userId, "health", Math.round(health.max * fraction));
  }
  const shield = ctx.scene.entity.stats.get(userId, "shield");
  if (shield !== null) ctx.scene.entity.stats.delta(userId, "shield", Math.round(shield.max * 0.5));
  ffylStore.write(ctx, { phase: "up", untilMs: 0 });
}

export function ffylExpired(ctx: GameContext, nowMs: number): boolean {
  const ffyl = ffylOf(ctx);
  return ffyl.phase === "downed" && nowMs >= ffyl.downedUntilMs;
}

export function markRespawned(ctx: GameContext): void {
  ffylOf(ctx).phase = "up";
  ffylStore.write(ctx, { phase: "up", untilMs: 0 });
}
