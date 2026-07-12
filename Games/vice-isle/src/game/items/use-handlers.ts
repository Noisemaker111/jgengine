import { cameraShake } from "@jgengine/shell/camera";
import type { ItemUseHandler } from "@jgengine/core/item/use";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { handroll } from "../handroll";
import { AMMO_STAT_IDS, gearById, weaponById } from "./weapons/catalog";

const lastFiredAt = new Map<string, number>();

export function resetWeaponState(): void {
  lastFiredAt.clear();
}

function gate(ctx: GameContext, from: string, id: string, intervalMs: number): boolean {
  const nowMs = ctx.time.now() * 1000;
  const key = `${from}:${id}`;
  if (nowMs < (lastFiredAt.get(key) ?? 0)) return false;
  lastFiredAt.set(key, nowMs + intervalMs);
  return true;
}

const fireGun: ItemUseHandler<GameContext> = {
  apply(ctx, input) {
    const def = weaponById(input.itemId);
    if (def === undefined) return { state: ctx, error: "unknown-weapon" };
    if (!gate(ctx, input.from, def.id, def.fireIntervalMs)) return { state: ctx };

    if (def.ammo !== "none") {
      const statId = AMMO_STAT_IDS[def.ammo];
      const ammo = ctx.scene.entity.stats.get(input.from, statId);
      if (ammo === null || ammo.current < def.ammoPerShot) {
        ctx.scene.entity.floatText({ instanceId: input.from, text: "OUT OF AMMO", kind: "warn" });
        return { state: ctx };
      }
      ctx.scene.entity.stats.delta(input.from, statId, -def.ammoPerShot);
    }

    cameraShake(def.ammo === "shell" ? 0.28 : 0.1);
    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { item: def.id },
      aim,
      effect: "damage",
    });
    const settled = ctx.scene.entity.settleProjectile(shotId);
    if (settled.status === "settled" && settled.hits.length > 0) {
      const hit = settled.hits[0];
      if (hit !== undefined) {
        const target = ctx.scene.entity.get(hit.instanceId);
        if (target !== null && (target.name.startsWith("ped_") || target.name.startsWith("cop_"))) {
          handroll.addHeat(ctx, target.name.startsWith("cop_") ? 90 : 55);
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
    if (!gate(ctx, input.from, def.id, def.fireIntervalMs)) return { state: ctx };
    ctx.player.inventory.take("backpack", input.itemId, 1);
    const aim = input.aim ?? { yaw: ctx.scene.entity.get(input.from)?.rotationY ?? 0, pitch: 0 };
    const shotId = ctx.scene.entity.fireProjectile({ from: input.from, via: { item: def.id }, aim, effect: "damage" });
    const explosion = def.weapon.explosion;
    const damage = def.weapon.damage;
    ctx.time.after(def.weapon.projectile.fuseTime, () => {
      const settled = ctx.scene.entity.settleProjectile(shotId);
      if (settled.status !== "settled") return;
      ctx.scene.entity.effect({ from: input.from, at: settled.at, radius: explosion.radius, effect: "damage", via: { amount: damage } });
      cameraShake(0.55);
      handroll.addHeat(ctx, 70);
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
