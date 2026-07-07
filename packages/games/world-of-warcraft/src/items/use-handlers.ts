import type { Aim } from "@jgengine/core/scene/spatial";
import { evaluateSkillCheck } from "@jgengine/core/interaction/skillCheck";
import { captureChance, rollCapture } from "@jgengine/core/scene/captureCheck";
import type { ItemUseHandler, ItemUseRejection } from "@jgengine/core/item/use";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import {
  flashAbility,
  isAbilityReady,
  startAbilityCooldown,
} from "../combat/abilityCooldowns";
import { queueProjectileShot } from "../combat/pendingProjectiles";
import {
  endFishingSession,
  fishingCheckConfig,
  fishingSessionStartedAt,
  startFishingSession,
} from "../combat/skillCheckSessions";

function hostileTarget(ctx: GameContext, from: string): string | null {
  const target = ctx.scene.entity.getTarget(from);
  if (target === null) return null;
  if (ctx.scene.entity.canReceive(target, "damage") !== null) return null;
  return target;
}

function healTarget(ctx: GameContext, from: string): string {
  const target = ctx.scene.entity.getTarget(from);
  if (target !== null && target !== from && ctx.scene.entity.canReceive(target, "heal") === null) {
    return target;
  }
  return from;
}

function manaCost(ctx: GameContext, itemId: string): number {
  return ctx.item.weapon.getStat(itemId, "manaCost") ?? 0;
}

function cooldownSeconds(ctx: GameContext, itemId: string): number {
  return ctx.item.weapon.getStat(itemId, "cooldownSeconds") ?? 0;
}

function rejectOnCooldown(_ctx: GameContext, from: string, itemId: string): ItemUseRejection | null {
  if (!isAbilityReady(from, itemId)) return { reason: "Ability on cooldown" };
  return null;
}

function rejectWithoutMana(ctx: GameContext, from: string, itemId: string): ItemUseRejection | null {
  const cost = manaCost(ctx, itemId);
  if (cost === 0) return null;
  const mana = ctx.scene.entity.stats.get(from, "mana");
  if (mana === null || mana.current < cost) return { reason: "Not enough mana" };
  return null;
}

function spendMana(ctx: GameContext, from: string, itemId: string): void {
  const cost = manaCost(ctx, itemId);
  if (cost > 0) ctx.scene.entity.stats.delta(from, "mana", -cost);
}

function completeUse(ctx: GameContext, from: string, itemId: string): void {
  const now = performance.now() / 1000;
  startAbilityCooldown(from, itemId, cooldownSeconds(ctx, itemId));
  flashAbility(from, itemId, now);
}

function fallbackAim(ctx: GameContext, from: string): Aim {
  return { yaw: ctx.scene.entity.get(from)?.rotationY ?? 0, pitch: 0 };
}

function aimAtTarget(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): Aim {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const horizontal = Math.sqrt(dx * dx + dz * dz);
  return { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.max(horizontal, 0.001)) };
}

function boltColor(itemId: string): string {
  if (itemId === "frostbolt") return "#60a5fa";
  if (itemId === "fireball") return "#f97316";
  return "#fbbf24";
}

const castBolt: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    const cooldown = rejectOnCooldown(ctx, input.from, input.itemId);
    if (cooldown !== null) return cooldown;
    if (hostileTarget(ctx, input.from) === null) {
      return { reason: "No target — press Tab to select an enemy" };
    }
    return rejectWithoutMana(ctx, input.from, input.itemId);
  },
  apply(ctx, input) {
    const target = hostileTarget(ctx, input.from);
    if (target === null) return { state: ctx, error: "No target" };
    const range = ctx.item.weapon.getStat(input.itemId, "range") ?? 30;
    const distance = ctx.scene.entity.distance(input.from, target);
    if (distance === null || distance > range) return { state: ctx, error: "Target out of range" };
    spendMana(ctx, input.from, input.itemId);
    const fromEntity = ctx.scene.entity.get(input.from);
    const targetEntity = ctx.scene.entity.get(target);
    if (fromEntity === null || targetEntity === null) return { state: ctx, error: "Missing entity" };
    const aim = aimAtTarget(fromEntity.position, targetEntity.position);
    const speed = ctx.item.weapon.getStat(input.itemId, "projectile.speed") ?? 22;
    const travelTime = Math.max(0.15, distance / speed);
    const shotId = ctx.scene.entity.fireProjectile({
      from: input.from,
      via: { item: input.itemId },
      aim,
      effect: "damage",
    });
    queueProjectileShot(
      shotId,
      {
        id: shotId,
        from: [fromEntity.position[0], fromEntity.position[1] + 1.1, fromEntity.position[2]],
        to: [targetEntity.position[0], targetEntity.position[1] + 0.9, targetEntity.position[2]],
        color: boltColor(input.itemId),
        duration: travelTime,
      },
      travelTime,
    );
    completeUse(ctx, input.from, input.itemId);
    return { state: ctx };
  },
};

const castHeal: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    const cooldown = rejectOnCooldown(ctx, input.from, input.itemId);
    if (cooldown !== null) return cooldown;
    const rejection = rejectWithoutMana(ctx, input.from, input.itemId);
    if (rejection !== null) return rejection;
    if (ctx.scene.entity.canReceive(healTarget(ctx, input.from), "heal") !== null) {
      return { reason: "Target cannot be healed" };
    }
    return null;
  },
  apply(ctx, input) {
    const target = healTarget(ctx, input.from);
    const amount = ctx.item.weapon.getStat(input.itemId, "heal") ?? 0;
    spendMana(ctx, input.from, input.itemId);
    ctx.scene.entity.effect({ from: input.from, to: target, effect: "heal", via: { amount: -amount } });
    completeUse(ctx, input.from, input.itemId);
    return { state: ctx };
  },
};

const swingSword: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    return rejectOnCooldown(ctx, input.from, input.itemId);
  },
  apply(ctx, input) {
    const reach = ctx.item.weapon.getStat(input.itemId, "reach") ?? 2.5;
    const hits = ctx.scene.entity
      .queryArc({ from: input.from, aim: input.aim ?? fallbackAim(ctx, input.from), radius: reach })
      .filter((instanceId) => ctx.scene.entity.canReceive(instanceId, "damage") === null);
    if (hits.length === 0) return { state: ctx, error: "Nothing in reach" };
    for (const hit of hits) {
      ctx.scene.entity.effect({ from: input.from, to: hit, effect: "damage", via: { item: input.itemId } });
    }
    completeUse(ctx, input.from, input.itemId);
    return { state: ctx };
  },
};

const drinkHealthPotion: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    const cooldown = rejectOnCooldown(ctx, input.from, input.itemId);
    if (cooldown !== null) return cooldown;
    if (ctx.scene.entity.canReceive(input.from, "heal") !== null) {
      return { reason: "Cannot heal right now" };
    }
    return null;
  },
  apply(ctx, input) {
    const amount = ctx.item.weapon.getStat(input.itemId, "heal") ?? 0;
    ctx.scene.entity.effect({ from: input.from, to: input.from, effect: "heal", via: { amount: -amount } });
    const inventoryId =
      input.inventoryId ?? (ctx.player.inventory.count("hotbar", input.itemId) > 0 ? "hotbar" : "backpack");
    ctx.player.inventory.take(inventoryId, input.itemId, 1);
    completeUse(ctx, input.from, input.itemId);
    return { state: ctx };
  },
};

const castFishingLine: ItemUseHandler<GameContext> = {
  apply(ctx, input) {
    const startedAt = fishingSessionStartedAt(input.from);
    if (startedAt === undefined) {
      startFishingSession(input.from, ctx.time.now());
      return { state: ctx };
    }
    const elapsed = ctx.time.now() - startedAt;
    const result = evaluateSkillCheck(fishingCheckConfig, elapsed);
    endFishingSession(input.from);
    if (result.success) {
      ctx.game.feed.push("fishing.result", { data: "Reeled in a catch!" });
    } else {
      ctx.game.feed.push("fishing.result", {
        data: result.timedOut ? "The line went slack." : "The fish got away.",
      });
    }
    return { state: ctx };
  },
};

const attemptCapture: ItemUseHandler<GameContext> = {
  can(ctx, input) {
    if (ctx.scene.entity.getTarget(input.from) === null) {
      return { reason: "No target — press Tab to select a creature" };
    }
    return null;
  },
  apply(ctx, input) {
    const target = ctx.scene.entity.getTarget(input.from);
    if (target === null) return { state: ctx, error: "No target" };
    const health = ctx.scene.entity.stats.get(target, "health");
    if (health === null) return { state: ctx, error: "Target has no health" };
    const catalogId = ctx.scene.entity.get(target)?.name ?? "unknown";
    const catchPower = ctx.item.weapon.getStat(input.itemId, "catchPower") ?? 1;
    const hpFraction = health.max <= 0 ? 0 : health.current / health.max;
    const captured = rollCapture({ hpFraction, catchPower });
    const inventoryId =
      input.inventoryId ?? (ctx.player.inventory.count("hotbar", input.itemId) > 0 ? "hotbar" : "backpack");
    ctx.player.inventory.take(inventoryId, input.itemId, 1);
    if (captured) {
      ctx.game.roster.capture(input.from, catalogId);
      ctx.scene.entity.despawn(target);
      ctx.scene.entity.setTarget(input.from, null);
      ctx.game.feed.push("capture.result", { data: `Captured! ${catalogId} joined your roster.` });
    } else {
      ctx.game.feed.push("capture.result", { data: `${catalogId} broke free.` });
    }
    return { state: ctx };
  },
};

export function captureOddsFor(ctx: GameContext, targetInstanceId: string, itemId = "capture_orb"): number {
  const health = ctx.scene.entity.stats.get(targetInstanceId, "health");
  if (health === null || health.max <= 0) return 0;
  const catchPower = ctx.item.weapon.getStat(itemId, "catchPower") ?? 1;
  return captureChance({ hpFraction: health.current / health.max, catchPower });
}

export const itemUseHandlers: Record<string, ItemUseHandler<GameContext>> = {
  castBolt,
  castHeal,
  swingSword,
  drinkHealthPotion,
  castFishingLine,
  attemptCapture,
};