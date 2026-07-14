import type { ItemUseHandler } from "@jgengine/core/item/use";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { AMMO_LABELS, AMMO_STAT_IDS } from "../ammo";
import { SOUND_IDS } from "../audio/catalog";
import { FIRE_KICK, SHOT_KNOCKBACK, kickCamera } from "../feel";
import { session } from "../run/session";
import { gearById } from "./gear/catalog";
import { weaponById } from "./weapons/catalog";

const lastFiredAt = new Map<string, number>();
const lastWarnAt = new Map<string, number>();

export function resetWeaponState(): void {
  lastFiredAt.clear();
  lastWarnAt.clear();
}

function warn(ctx: GameContext, from: string, text: string, sound?: string): void {
  const nowMs = ctx.time.now() * 1000;
  const at = lastWarnAt.get(from) ?? 0;
  if (nowMs - at < 600) return;
  lastWarnAt.set(from, nowMs);
  ctx.scene.entity.floatText({ instanceId: from, text, kind: "warn" });
  if (sound !== undefined) ctx.game.events.emit("audio.play", { sound });
}

const fireGun: ItemUseHandler<GameContext> = {
  apply(ctx, input) {
    const def = weaponById(input.itemId);
    if (def === undefined) return { state: ctx, error: "unknown-weapon" };

    const nowMs = ctx.time.now() * 1000;
    const gateKey = `${input.from}:${def.id}`;
    const readyAt = lastFiredAt.get(gateKey) ?? 0;
    if (nowMs < readyAt) return { state: ctx };

    const statId = AMMO_STAT_IDS[def.ammo];
    const ammo = ctx.scene.entity.stats.get(input.from, statId);
    if (ammo === null || ammo.current < def.ammoPerShot) {
      warn(ctx, input.from, `NO ${AMMO_LABELS[def.ammo].toUpperCase()} AMMO`, SOUND_IDS.noAmmo);
      return { state: ctx };
    }

    lastFiredAt.set(gateKey, nowMs + def.weapon.fireIntervalMs);
    ctx.scene.entity.stats.delta(input.from, statId, -def.ammoPerShot);
    ctx.game.events.emit("audio.play", { sound: SOUND_IDS.fire(def.family) });
    ctx.game.playEntityAnimation(input.from, "fire");
    kickCamera(FIRE_KICK[def.family]);

    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { item: def.id },
      aim,
      effect: "damage",
    });

    if (def.weapon.projectile !== undefined && def.weapon.explosion !== undefined) {
      const radius = def.weapon.explosion.radius;
      const fuse = def.weapon.projectile.fuseTime;
      ctx.time.after(fuse, () => {
        const settled = ctx.scene.entity.settleProjectile(shotId);
        if (settled.status !== "settled") return;
        ctx.game.events.emit("audio.play", { sound: SOUND_IDS.explosion, at: settled.at });
        ctx.scene.entity.effect({
          from: input.from,
          at: settled.at,
          radius,
          effect: "damage",
          via: { amount: def.weapon.damage },
        });
      });
      session.noteShot(true);
      return { state: ctx };
    }

    const settled = ctx.scene.entity.settleProjectile(shotId);
    const hit = settled.status === "settled" && settled.hits.length > 0;
    session.noteShot(hit);
    if (hit && settled.status === "settled") {
      ctx.game.events.emit("audio.play", { sound: SOUND_IDS.hitImpact, at: settled.at });
      const first = settled.hits[0];
      if (first !== undefined) {
        ctx.scene.entity.hitReaction({
          from: input.from,
          to: first.instanceId,
          config: SHOT_KNOCKBACK,
          power: Math.min(2.4, def.weapon.damage / 30),
        });
      }
    }

    if (hit && settled.status === "settled" && session.rng() < def.weapon.critChance) {
      const first = settled.hits[0];
      if (first !== undefined) {
        ctx.scene.entity.effect({
          from: input.from,
          to: first.instanceId,
          effect: "damage",
          via: { amount: Math.round(def.weapon.damage * (def.weapon.critMult - 1)) },
        });
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
    const def = gearById(input.itemId);
    if (def?.weapon?.projectile === undefined || def.weapon.explosion === undefined) {
      return { state: ctx, error: "not-throwable" };
    }
    if (ctx.player.inventory.count("backpack", input.itemId) < 1) {
      warn(ctx, input.from, "NO GRENADES");
      return { state: ctx };
    }
    const nowMs = ctx.time.now() * 1000;
    const gateKey = `${input.from}:${def.id}`;
    const readyAt = lastFiredAt.get(gateKey) ?? 0;
    if (nowMs < readyAt) return { state: ctx };
    lastFiredAt.set(gateKey, nowMs + def.weapon.fireIntervalMs);

    ctx.player.inventory.take("backpack", input.itemId, 1);
    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { item: def.id },
      aim,
      effect: "damage",
    });
    const weapon = def.weapon;
    ctx.time.after(weapon.projectile?.fuseTime ?? 1.2, () => {
      const settled = ctx.scene.entity.settleProjectile(shotId);
      if (settled.status !== "settled") return;
      ctx.game.events.emit("audio.play", { sound: SOUND_IDS.explosion, at: settled.at });
      ctx.scene.entity.effect({
        from: input.from,
        at: settled.at,
        radius: weapon.explosion?.radius ?? 4,
        effect: "damage",
        via: { amount: weapon.damage },
      });
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
    if (health === null) return { state: ctx };
    if (health.current >= health.max) {
      warn(ctx, input.from, "HEALTH FULL");
      return { state: ctx };
    }
    ctx.player.inventory.take("backpack", input.itemId, 1);
    ctx.game.events.emit("audio.play", { sound: SOUND_IDS.medkit });
    ctx.scene.entity.effect({
      from: input.from,
      to: input.from,
      effect: "damage",
      via: { amount: -def.heal },
    });
    return { state: ctx };
  },
};

export const itemUseHandlers: Record<string, ItemUseHandler<GameContext>> = {
  fireGun,
  throwGrenade,
  useMedkit,
};
