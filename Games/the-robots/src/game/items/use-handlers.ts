import type { ItemUseHandler } from "@jgengine/core/item/use";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { seededRng } from "@jgengine/core/random/rng";
import { cameraShake } from "@jgengine/shell/camera";
import { AMMO_LABELS } from "../ammo";
import { bonus } from "../characters";
import { enemyById } from "../entities/enemies/catalog";
import { noteHit, noteShot } from "../feel";
import {
  applyElementalProc,
  consumeRound,
  elementalDamageMult,
  gunById,
  isReloading,
  magLoaded,
  startReload,
} from "../handroll";

const combatRng = seededRng("bl2-combat-procs");
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

function gunDamageMult(): number {
  return 1 + bonus("gunDamage");
}

function applyHitModifiers(
  ctx: GameContext,
  from: string,
  targetId: string,
  gunId: string,
  nowMs: number,
): void {
  const gun = gunById(gunId);
  if (gun === undefined) return;
  const targetEntity = ctx.scene.entity.get(targetId);
  if (targetEntity === null) return;
  const targetDef = enemyById(targetEntity.name);
  const surface = targetDef?.surface ?? "flesh";
  const shield = ctx.scene.entity.stats.get(targetId, "shield");
  const shielded = shield !== null && shield.current > 0;

  let mult = elementalDamageMult(ctx, gun.element, surface, shielded, targetId, nowMs) * gunDamageMult();
  const crit = combatRng() < gun.weapon.critChance + bonus("critChance");
  if (crit) mult *= gun.weapon.critMult + bonus("critDamage");

  const extra = Math.round(gun.weapon.damage * (mult - 1));
  if (extra !== 0) {
    ctx.scene.entity.effect({ from, to: targetId, effect: "damage", via: { amount: extra } });
  }
  if (crit) {
    ctx.scene.entity.floatText({ instanceId: targetId, text: "CRITICAL!", kind: "warn" });
  }
  const killed = (ctx.scene.entity.stats.get(targetId, "health")?.current ?? 1) <= 0;
  noteHit(nowMs, crit, killed);
  applyElementalProc(ctx, combatRng, gun, from, targetId, nowMs);
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
    cameraShake(Math.min(0.3, 0.05 + gun.weapon.damage / 400), 6);

    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { item: gun.id },
      aim,
      effect: "damage",
    });

    if (gun.weapon.projectile !== undefined && gun.weapon.explosion !== undefined) {
      const explosion = gun.weapon.explosion;
      ctx.time.after(gun.weapon.projectile.fuseTime, () => {
        const settled = ctx.scene.entity.settleProjectile(shotId);
        if (settled.status !== "settled") return;
        cameraShake(0.45);
        ctx.scene.entity.effect({
          from: input.from,
          at: settled.at,
          radius: explosion.radius,
          effect: "damage",
          via: { amount: Math.round(gun.weapon.damage * gunDamageMult()) },
        });
      });
      return { state: ctx };
    }

    const settled = ctx.scene.entity.settleProjectile(shotId);
    if (settled.status === "settled") {
      for (const hit of settled.hits) {
        applyHitModifiers(ctx, input.from, hit.instanceId, gun.id, nowMs);
      }
      if (settled.hits.length > 0 && gun.weapon.explosion !== undefined) {
        ctx.scene.entity.effect({
          from: input.from,
          at: settled.at,
          radius: gun.weapon.explosion.radius,
          effect: "damage",
          via: { amount: Math.round(gun.weapon.damage * 0.5) },
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
      via: { item: "frag_grenade" },
      aim,
      effect: "damage",
    });
    ctx.time.after(GRENADE.fuseTime, () => {
      const settled = ctx.scene.entity.settleProjectile(shotId);
      if (settled.status !== "settled") return;
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
