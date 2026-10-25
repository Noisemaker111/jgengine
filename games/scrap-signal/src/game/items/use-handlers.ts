import type { ItemUseHandler } from "@jgengine/core/item/use";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { cameraShake } from "@jgengine/shell/camera";
import { AMMO_LABELS } from "../ammo";
import { bonus } from "../characters";
import { resolveGunHit, type GunHitMods } from "../combat/hitModel";
import { perkAfterHit, perkDamageScale, perkHitMods, perkShot, watchDeaths, withGunKills } from "../combat/gunPerks";
import { noteHit, noteShot } from "../feel";
import { playHit, playShot } from "../audio/drive";
import {
  applyElementalProc,
  consumeRound,
  gunById,
  isReloading,
  magLoaded,
  startReload,
} from "../handroll";
import type { HitReactionConfig } from "@jgengine/core/combat/hitReaction";

const combatRng = seededRng("scrap-combat-procs");
const lastFiredAt = new Map<string, number>();
const lastWarnAt = new Map<string, number>();

export const GRENADE = { damage: 55, radius: 4.2, fuseTime: 1.3, speed: 18, intervalMs: 900 };

export function resetWeaponState(): void {
  lastFiredAt.clear();
  lastWarnAt.clear();
}

function warn(ctx: GameContext, from: string, text: string): void {
  const nowMs = ctx.time.now() * 1000;
  const at = lastWarnAt.get(from) ?? 0;
  if (nowMs - at < 600) return;
  lastWarnAt.set(from, nowMs);
  ctx.scene.entity.floatText({ instanceId: from, text, kind: "warn" });
}

/** Hit-feel tier for a landed shot: kills read heaviest, crits shove harder, plain hits only flinch. */
export function hitFeel(crit: boolean, killed: boolean): HitReactionConfig | "enemyKilled" {
  if (killed) return "enemyKilled";
  return crit ? { hitstopMs: 30, knockback: 0.35, trauma: 0.08 } : { hitstopMs: 0, knockback: 0.12 };
}

/**
 * One landed pellet: the shared damage model resolves the number (element chart, gun talent, crit),
 * the world takes it as one application, and the feel cues read the same resolution. Errors out on a
 * body the damage model has no profile for — that is the wiring check, not a zero-damage hit.
 */
function landGunHit(ctx: GameContext, from: string, targetId: string, gunId: string, nowMs: number, shot: GunHitMods = {}): void {
  const gun = gunById(gunId);
  if (gun === undefined) return;
  const wasAlive = (ctx.scene.entity.stats.get(targetId, "health")?.current ?? 0) > 0;
  const mods = perkHitMods(ctx, gun, targetId, shot);
  const { value: outcome, died } = watchDeaths(ctx, () => resolveGunHit(ctx, gun, from, targetId, gun.elementChance + bonus("elementChance"), mods));
  if (outcome.crit) {
    ctx.scene.entity.floatText({ instanceId: targetId, text: "CRITICAL!", kind: "warn" });
  }
  const killed = (ctx.scene.entity.stats.get(targetId, "health")?.current ?? 1) <= 0;
  noteHit(nowMs, outcome.crit, killed);
  // Body feel through the SDK's shared hit reaction: the target flinches (knockback + shell flinch
  // animation), crits add a light shake, and kills use the calibrated enemyKilled preset.
  ctx.scene.entity.hitReaction({ from, to: targetId, config: hitFeel(outcome.crit, killed) });
  playHit(ctx, ctx.scene.entity.get(targetId)?.position ?? [0, 0, 0], outcome.crit);
  applyElementalProc(ctx, combatRng, gun, from, targetId);
  perkAfterHit(ctx, gun, from, targetId, outcome, wasAlive && (killed || died.has(targetId)));
}

const fireGun: ItemUseHandler<GameContext> = {
  apply(ctx, input) {
    const gun = gunById(input.itemId);
    if (gun === undefined) return { state: ctx, error: "unknown-gun" };
    const nowMs = ctx.time.now() * 1000;
    if (isReloading(ctx, gun)) return { state: ctx };

    const gateKey = `${input.from}:${gun.id}`;
    const readyAt = lastFiredAt.get(gateKey) ?? 0;
    if (nowMs < readyAt) return { state: ctx };

    if (magLoaded(ctx, gun) < gun.ammoPerShot) {
      if (!startReload(ctx, gun)) warn(ctx, input.from, `NO ${AMMO_LABELS[gun.ammo].toUpperCase()} AMMO`);
      return { state: ctx };
    }
    // Perk shot events read the magazine before the round leaves it (Opening Shot wants a full mag).
    const shot = perkShot(ctx, gun, input.aim);
    // Free-shot refund: roll before spending so a refunded shot leaves the mag untouched (the old code
    // spent the round then added it back). The `combatRng()` draw stays gated behind `ammoRefund > 0` and
    // happens once per fired shot, so the shared proc/crit rng stream keeps the same order.
    if (bonus("ammoRefund") > 0 && combatRng() < bonus("ammoRefund")) {
      ctx.scene.entity.floatText({ instanceId: input.from, text: "FREE SHOT", kind: "pickup" });
    } else {
      consumeRound(ctx, gun);
    }
    lastFiredAt.set(gateKey, nowMs + Math.round(gun.weapon.fireIntervalMs / (1 + bonus("fireRate"))));
    noteShot(nowMs, gun.family);
    playShot(ctx, gun.family);
    cameraShake(Math.min(0.3, 0.05 + gun.weapon.damage / 400), 6);

    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    // Delivery stays the engine projectile (its cone, ballistics and settled event are what the tracer
    // and cover rules are built on); damage is the shared model's job, so the projectile itself lands 0.
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { item: gun.id, amount: 0 },
      aim,
      effect: "damage",
    });

    if (gun.weapon.projectile !== undefined && gun.weapon.explosion !== undefined) {
      const explosion = gun.weapon.explosion;
      ctx.time.after(gun.weapon.projectile.fuseTime, () => {
        const settled = ctx.scene.entity.settleProjectile(shotId);
        if (settled.status !== "settled") return;
        // A launched round's direct impact was never elemental or critical: it lands its base number,
        // scaled by live perk buffs; its kills (direct and splash) earn the launcher's kill perks.
        const scale = perkDamageScale(ctx, gun) * (shot.damageScale ?? 1);
        withGunKills(ctx, gun, input.from, () => {
          for (const hit of settled.hits) {
            ctx.scene.entity.effect({
              from: input.from,
              to: hit.instanceId,
              effect: "damage",
              via: { amount: Math.round(gun.weapon.damage * scale), item: gun.id },
            });
          }
          cameraShake(0.45);
          ctx.scene.entity.effect({
            from: input.from,
            at: settled.at,
            radius: explosion.radius,
            effect: "damage",
            via: { amount: Math.round(gun.weapon.damage * (1 + bonus("gunDamage")) * scale) },
          });
        });
      });
      return { state: ctx };
    }

    const settled = ctx.scene.entity.settleProjectile(shotId);
    if (settled.status === "settled") {
      for (const hit of settled.hits) {
        landGunHit(ctx, input.from, hit.instanceId, gun.id, nowMs, shot);
      }
      const explosion = gun.weapon.explosion;
      if (settled.hits.length > 0 && explosion !== undefined) {
        withGunKills(ctx, gun, input.from, () => {
          ctx.scene.entity.effect({
            from: input.from,
            at: settled.at,
            radius: explosion.radius,
            effect: "damage",
            via: { amount: Math.round(gun.weapon.damage * 0.5 * perkDamageScale(ctx, gun)) },
          });
        });
      }
    }
    return { state: ctx };
  },
};

const throwGrenade: ItemUseHandler<GameContext> = {
  apply(ctx, input) {
    const grenades = ctx.scene.entity.stats.get(input.from, "grenades");
    if (grenades === null || grenades.current < 1) {
      warn(ctx, input.from, "NO GRENADES");
      return { state: ctx };
    }
    const nowMs = ctx.time.now() * 1000;
    const readyAt = lastFiredAt.get(`${input.from}:grenade`) ?? 0;
    if (nowMs < readyAt) return { state: ctx };
    lastFiredAt.set(`${input.from}:grenade`, nowMs + GRENADE.intervalMs);
    ctx.scene.entity.stats.delta(input.from, "grenades", -1);

    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { item: "frag_grenade", amount: 0 },
      aim,
      effect: "damage",
    });
    ctx.time.after(GRENADE.fuseTime, () => {
      const settled = ctx.scene.entity.settleProjectile(shotId);
      if (settled.status !== "settled") return;
      for (const hit of settled.hits) {
        ctx.scene.entity.effect({
          from: input.from,
          to: hit.instanceId,
          effect: "damage",
          via: { amount: GRENADE.damage, item: "frag_grenade" },
        });
      }
      cameraShake(0.5);
      ctx.scene.entity.effect({
        from: input.from,
        at: settled.at,
        radius: GRENADE.radius,
        effect: "damage",
        via: { amount: Math.round(GRENADE.damage * (1 + bonus("grenadeDamage"))) },
      });
    });
    return { state: ctx };
  },
};

const useHealthVial: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) return { reason: "no-vials" };
    return null;
  },
  apply(ctx, input) {
    const heal = input.itemId === "insta_health_big" ? 80 : 35;
    const health = ctx.scene.entity.stats.get(input.from, "health");
    if (health === null) return { state: ctx };
    if (health.current >= health.max) {
      warn(ctx, input.from, "HEALTH FULL");
      return { state: ctx };
    }
    ctx.player.inventory.take("backpack", input.itemId, 1);
    ctx.scene.entity.effect({ from: input.from, to: input.from, effect: "damage", via: { amount: -heal } });
    return { state: ctx };
  },
};

const useShieldBooster: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) return { reason: "no-booster" };
    return null;
  },
  apply(ctx, input) {
    const shield = ctx.scene.entity.stats.get(input.from, "shield");
    if (shield === null) return { state: ctx };
    ctx.player.inventory.take("backpack", input.itemId, 1);
    ctx.scene.entity.stats.set(input.from, "shield", { max: shield.max + 25 });
    ctx.scene.entity.stats.delta(input.from, "shield", 25);
    ctx.scene.entity.floatText({ instanceId: input.from, text: "SHIELD CAPACITY +25", kind: "pickup" });
    return { state: ctx };
  },
};

export const itemUseHandlers: Record<string, ItemUseHandler<GameContext>> = {
  fireGun,
  throwGrenade,
  useHealthVial,
  useShieldBooster,
};

