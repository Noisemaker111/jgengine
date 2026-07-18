import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { bonus } from "../characters";

export interface ShieldWatch {
  lastHitAtMs: number;
  lastShield: number;
  lastHealth: number;
}

/** Per-session shield-regen bookkeeping, keyed by entity id — reclaimed with the context (#632). */
const shieldWatchOf = perContext(() => new Map<string, ShieldWatch>());
const playerHurtOf = perContext(() => ({ atMs: 0 }));

export const SHIELD_REGEN_DELAY_MS = 5000;

function notePlayerHurt(ctx: GameContext, nowMs: number): void {
  playerHurtOf(ctx).atMs = nowMs;
}

export function playerLastHurtAtMs(ctx: GameContext): number {
  return playerHurtOf(ctx).atMs;
}

export function tickShields(ctx: GameContext, nowMs: number, dt: number, regenBonus = 1): void {
  const shieldWatch = shieldWatchOf(ctx);
  for (const entity of ctx.scene.entity.list()) {
    const shield = ctx.scene.entity.stats.get(entity.id, "shield");
    if (shield === null || shield.max <= 0) continue;
    const health = ctx.scene.entity.stats.get(entity.id, "health");
    let watch = shieldWatch.get(entity.id);
    if (watch === undefined) {
      watch = { lastHitAtMs: 0, lastShield: shield.current, lastHealth: health?.current ?? 0 };
      shieldWatch.set(entity.id, watch);
    }
    const currentHealth = health?.current ?? 0;
    if (shield.current < watch.lastShield || currentHealth < watch.lastHealth) {
      watch.lastHitAtMs = nowMs;
      if (entity.id === ctx.player.userId) notePlayerHurt(ctx, nowMs);
    }
    watch.lastShield = shield.current;
    watch.lastHealth = currentHealth;
    if (shield.current >= shield.max) continue;
    const isLocalPlayer = entity.id === ctx.player.userId;
    const delay = isLocalPlayer
      ? SHIELD_REGEN_DELAY_MS * (1 - Math.min(0.6, bonus("shieldDelay")))
      : SHIELD_REGEN_DELAY_MS;
    if (nowMs - watch.lastHitAtMs < delay) continue;
    const rate = Math.max(6, shield.max * 0.12) * regenBonus * (isLocalPlayer ? 1 + bonus("shieldRegen") : 1);
    ctx.scene.entity.stats.delta(entity.id, "shield", rate * dt);
    watch.lastShield = ctx.scene.entity.stats.get(entity.id, "shield")?.current ?? shield.current;
  }
}
