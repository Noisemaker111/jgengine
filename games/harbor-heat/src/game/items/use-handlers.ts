import { cameraShake } from "@jgengine/core/camera/shake/cameraShake";
import { statPoolReserve } from "@jgengine/core/combat/magazine";
import { createWeaponTriggers, type WeaponTriggerShot, type WeaponTriggers } from "@jgengine/core/combat/weaponTriggers";
import type { ItemUseHandler } from "@jgengine/core/item/use";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import { cityEvent } from "../cityRuntime";
import { landExplosion, landWeaponHit } from "../combat/hitModel";
import { AMMO_STAT_IDS, gearById, weaponById } from "./weapons/catalog";
import { gunIntervalScale } from "../progression/upgrades";

/** What a gun shot looks and sounds like to the street: the camera kicks and the block hears it. */
function presentGunShot(ctx: GameContext, shot: WeaponTriggerShot): void {
  const def = weaponById(shot.weapon);
  if (def?.use !== "fireGun") return;
  cameraShake(def.ammo === "shell" ? 0.28 : 0.1);
  const shooter = ctx.scene.entity.get(shot.shooter);
  if (shooter !== null) cityEvent(ctx, { kind: "gunfire", at: shooter.position, by: shot.shooter });
}

/**
 * Every shooter's trigger per weapon, on the game clock. A dry pull waits out the weapon's interval,
 * so "OUT OF AMMO" repeats at the gun's cadence rather than every frame.
 */
const triggersOf = perContext((ctx): WeaponTriggers => {
  const triggers = createWeaponTriggers({ dryPull: "cooldown" });
  triggers.onShot((shot) => presentGunShot(ctx, shot));
  return triggers;
});

/** The weapon triggers for this world: cadence state and the per-shot presentation seam. */
export function weaponTriggers(ctx: GameContext): WeaponTriggers {
  return triggersOf(ctx);
}

export function resetWeaponState(ctx: GameContext): void {
  triggersOf(ctx).clear();
}

const fireGun: ItemUseHandler<GameContext> = {
  apply(ctx, input) {
    const def = weaponById(input.itemId);
    if (def === undefined) return { state: ctx, error: "unknown-weapon" };
    const pulled = triggersOf(ctx).pull({
      shooter: input.from,
      weapon: def.id,
      nowMs: ctx.time.now() * 1000,
      intervalMs: def.fireIntervalMs * (input.from === ctx.player.userId ? gunIntervalScale(ctx) : 1),
      // Guns fire straight from the shooter's ammo stat: Harbor Heat has no magazines.
      ...(def.ammo === "none" ? {} : { rounds: def.ammoPerShot, ammo: statPoolReserve(ctx.scene.entity.stats, input.from, AMMO_STAT_IDS[def.ammo]) }),
    });
    if (pulled.status === "empty") ctx.scene.entity.floatText({ instanceId: input.from, text: "OUT OF AMMO", kind: "warn" });
    if (pulled.status !== "fired") return { state: ctx };

    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    // The projectile owns delivery, the cone and the muzzle→impact tracer. It carries no payload:
    // the shot reports who it reached, and the shared damage chart decides what the hit is worth.
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { amount: 0 },
      aim,
      effect: "damage",
    });
    const settled = ctx.scene.entity.settleProjectile(shotId);
    if (settled.status === "settled" && settled.hits.length > 0) {
      const hit = settled.hits[0];
      if (hit !== undefined) {
        const target = ctx.scene.entity.get(hit.instanceId);
        landWeaponHit(ctx, { from: input.from, to: hit.instanceId, weaponId: def.id });
        if (target !== null && (target.name.startsWith("ped_") || target.name.startsWith("cop_"))) {
          cityEvent(ctx, { kind: target.name.startsWith("cop_") ? "cop_shot" : "assault", at: target.position });
        }
      }
    }
    return { state: ctx };
  },
};

const throwGrenade: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) return { reason: "no-grenades" };
    return null;
  },
  apply(ctx, input) {
    const def = weaponById(input.itemId);
    if (def?.weapon.projectile === undefined || def.weapon.explosion === undefined) {
      return { state: ctx, error: "not-throwable" };
    }
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) return { state: ctx };
    const thrown = triggersOf(ctx).pull({ shooter: input.from, weapon: def.id, nowMs: ctx.time.now() * 1000, intervalMs: def.fireIntervalMs });
    if (thrown.status !== "fired") return { state: ctx };
    ctx.player.inventory.take("backpack", input.itemId, 1);
    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { amount: 0 },
      aim,
      effect: "damage",
    });
    const explosion = def.weapon.explosion;
    ctx.time.after(def.weapon.projectile.fuseTime, () => {
      const settled = ctx.scene.entity.settleProjectile(shotId);
      if (settled.status !== "settled") return;
      landExplosion(ctx, { from: input.from, at: settled.at, radius: explosion.radius, weaponId: def.id });
      cameraShake(0.55);
      cityEvent(ctx, { kind: "explosion", at: settled.at });
    });
    return { state: ctx };
  },
};

const useMedkit: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) return { reason: "no-medkits" };
    return null;
  },
  apply(ctx, input) {
    const def = gearById(input.itemId);
    if (def?.heal === undefined) return { state: ctx, error: "not-a-medkit" };
    const health = ctx.scene.entity.stats.get(input.from, "health");
    if (health === null || health.current >= health.max) {
      ctx.scene.entity.floatText({ instanceId: input.from, text: "HEALTH FULL", kind: "warn" });
      return { state: ctx };
    }
    ctx.player.inventory.take("backpack", input.itemId, 1);
    ctx.scene.entity.effect({ from: input.from, to: input.from, effect: "heal", via: { amount: def.heal } });
    return { state: ctx };
  },
};

const wearVest: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) return { reason: "no-vest" };
    return null;
  },
  apply(ctx, input) {
    const def = gearById(input.itemId);
    if (def?.armor === undefined) return { state: ctx, error: "not-a-vest" };
    const armor = ctx.scene.entity.stats.get(input.from, "armor");
    if (armor === null || armor.current >= armor.max) {
      ctx.scene.entity.floatText({ instanceId: input.from, text: "ARMOR FULL", kind: "warn" });
      return { state: ctx };
    }
    ctx.player.inventory.take("backpack", input.itemId, 1);
    ctx.scene.entity.stats.set(input.from, "armor", { current: def.armor });
    return { state: ctx };
  },
};

const loadAmmo: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) return { reason: "no-ammo-box" };
    return null;
  },
  apply(ctx, input) {
    const def = gearById(input.itemId);
    if (def?.ammoGrant === undefined) return { state: ctx, error: "not-ammo" };
    ctx.player.inventory.take("backpack", input.itemId, 1);
    ctx.scene.entity.stats.delta(input.from, def.ammoGrant.stat, def.ammoGrant.amount);
    ctx.scene.entity.floatText({ instanceId: input.from, text: `+${def.ammoGrant.amount} AMMO`, kind: "info" });
    return { state: ctx };
  },
};

export const itemUseHandlers: Record<string, ItemUseHandler<GameContext>> = {
  fireGun,
  throwGrenade,
  useMedkit,
  wearVest,
  loadAmmo,
};
