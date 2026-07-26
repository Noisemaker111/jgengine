import { createRegenShield, type RegenShield } from "@jgengine/core/combat/regenShield";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { bonus } from "../characters";

/**
 * Per-session shield regen, one pool-backed `RegenShield` per entity — reclaimed with the context
 * (#632). The shields themselves live in `ctx.scene.entity.stats`, because damage, the HUD and
 * replication all read them there; the `RegenShieldPool` port lets the engine primitive own the
 * grace-timer bookkeeping over that storage instead of this file snapshot-comparing stat values.
 */
const shieldsOf = perContext(() => new Map<string, RegenShield>());
const playerHurtOf = perContext(() => ({ atMs: 0 }));

export const SHIELD_REGEN_DELAY_MS = 5000;

/** Last health value seen per entity, so a hit that lands on health still stalls shield regen. */
const healthWatchOf = perContext(() => new Map<string, number>());

export function playerLastHurtAtMs(ctx: GameContext): number {
  return playerHurtOf(ctx).atMs;
}

function shieldFor(ctx: GameContext, entityId: string): RegenShield {
  const shields = shieldsOf(ctx);
  const existing = shields.get(entityId);
  if (existing !== undefined) return existing;
  const created = createRegenShield({
    // The entity stat owns the value and the bounds; `max`/`current` here are unused placeholders.
    max: 0,
    // Rate and delay are supplied per tick instead — talents change them mid-run.
    regenPerSecond: 0,
    regenDelayMs: SHIELD_REGEN_DELAY_MS,
    pool: {
      current: () => ctx.scene.entity.stats.get(entityId, "shield")?.current ?? 0,
      max: () => ctx.scene.entity.stats.get(entityId, "shield")?.max ?? 0,
      set: (value) => {
        const live = ctx.scene.entity.stats.get(entityId, "shield")?.current ?? 0;
        const delta = value - live;
        if (delta !== 0) ctx.scene.entity.stats.delta(entityId, "shield", delta);
      },
    },
  });
  shields.set(entityId, created);
  return created;
}

export function tickShields(ctx: GameContext, nowMs: number, dt: number, regenBonus = 1): void {
  const healthWatch = healthWatchOf(ctx);
  for (const entity of ctx.scene.entity.list()) {
    const shield = ctx.scene.entity.stats.get(entity.id, "shield");
    if (shield === null || shield.max <= 0) continue;
    const isLocalPlayer = entity.id === ctx.player.userId;
    const pool = shieldFor(ctx, entity.id);

    // A hit that lands on health (shield already down) must stall regen too — the shield cannot
    // see that one, so tell it explicitly.
    const currentHealth = ctx.scene.entity.stats.get(entity.id, "health")?.current ?? 0;
    const lastHealth = healthWatch.get(entity.id);
    if (lastHealth !== undefined && currentHealth < lastHealth) pool.noteDamage();
    healthWatch.set(entity.id, currentHealth);

    const wasSuppressed = pool.suppressed();
    // Rate and delay are re-read every tick: both are talent-derived and change mid-run.
    pool.tick(dt, {
      regenPerSecond: Math.max(6, shield.max * 0.12) * regenBonus * (isLocalPlayer ? 1 + bonus("shieldRegen") : 1),
      regenDelayMs: isLocalPlayer
        ? SHIELD_REGEN_DELAY_MS * (1 - Math.min(0.6, bonus("shieldDelay")))
        : SHIELD_REGEN_DELAY_MS,
    });
    // Shield damage is detected by the pool itself; surface the player's hits for the damage vignette.
    if (isLocalPlayer && !wasSuppressed && pool.suppressed()) playerHurtOf(ctx).atMs = nowMs;
  }
}
