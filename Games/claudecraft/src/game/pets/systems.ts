import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { addThreat, isMobInstance } from "../ai/mobs";
import { classOf } from "../session/hero";
import { petStore } from "../session/stores";
import {
  defaultPetForClass,
  PET_ABILITY_IDS,
  petById,
  type PetDef,
} from "./catalog";

export interface PetView {
  petId: string;
  name: string;
  instanceId: string | null;
  alive: boolean;
  hp: number;
  maxHp: number;
  role: string;
}

interface PetRuntime {
  defId: string;
  instanceId: string | null;
  dead: boolean;
  nextSwingAt: number;
}

const petsOf = perContext(() => new Map<string, PetRuntime>());

export function petViewOf(ctx: GameContext, userId: string): PetView | null {
  const runtime = petsOf(ctx).get(userId);
  if (runtime === undefined) return null;
  const def = petById(runtime.defId);
  if (def === null) return null;
  const hp =
    runtime.instanceId === null
      ? { current: 0, max: 1 }
      : (ctx.scene.entity.stats.get(runtime.instanceId, "health") ?? { current: 0, max: 1 });
  return {
    petId: def.id,
    name: def.name,
    instanceId: runtime.instanceId,
    alive: runtime.instanceId !== null && !runtime.dead,
    hp: hp.current,
    maxHp: hp.max,
    role: def.role,
  };
}

function syncPet(ctx: GameContext, userId: string): void {
  const view = petViewOf(ctx, userId);
  if (view === null) {
    petStore.clear(ctx, userId);
    return;
  }
  petStore.write(ctx, userId, view);
}

function petHp(def: PetDef, level: number): number {
  return Math.round(def.hpBase + def.hpPerLevel * (level - 1));
}

function spawnPetEntity(ctx: GameContext, userId: string, def: PetDef): string | null {
  const owner = ctx.scene.entity.get(userId);
  if (owner === null) return null;
  const x = owner.position[0] + 1.8;
  const z = owner.position[2] + 1.2;
  const instanceId = ctx.scene.entity.spawn(def.id, {
    id: `pet:${userId}`,
    position: [x, ctx.world.groundHeightAt(x, z), z],
  });
  const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const hp = petHp(def, level);
  ctx.scene.entity.stats.set(instanceId, "health", { max: hp, current: hp });
  ctx.scene.entity.stats.set(instanceId, "level", { current: level });
  return instanceId;
}

export function summonPet(ctx: GameContext, userId: string, petId?: string): boolean {
  const cls = classOf(ctx, userId);
  if (cls === null) return false;
  if (cls.id !== "hunter" && cls.id !== "warlock") return false;
  const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
  const def =
    petId !== undefined
      ? petById(petId)
      : defaultPetForClass(cls.id);
  if (def === null || def.classId !== cls.id || def.levelReq > level) return false;
  if (ctx.scene.entity.get(userId) === null) return false;
  dismissPet(ctx, userId, false);
  const instanceId = spawnPetEntity(ctx, userId, def);
  if (instanceId === null) return false;
  petsOf(ctx).set(userId, {
    defId: def.id,
    instanceId,
    dead: false,
    nextSwingAt: 0,
  });
  syncPet(ctx, userId);
  ctx.scene.entity.floatText({ instanceId: userId, text: `${def.name} joins you`, kind: "info" });
  return true;
}

export function dismissPet(ctx: GameContext, userId: string, announce = true): boolean {
  const runtime = petsOf(ctx).get(userId);
  if (runtime === undefined) return false;
  if (runtime.instanceId !== null && ctx.scene.entity.get(runtime.instanceId) !== null) {
    ctx.scene.entity.despawn(runtime.instanceId);
  }
  runtime.instanceId = null;
  runtime.dead = false;
  if (announce) {
    ctx.scene.entity.floatText({ instanceId: userId, text: "Pet dismissed", kind: "info" });
  }
  syncPet(ctx, userId);
  return true;
}

export function revivePet(ctx: GameContext, userId: string): boolean {
  const runtime = petsOf(ctx).get(userId);
  if (runtime === undefined || !runtime.dead) return false;
  const def = petById(runtime.defId);
  if (def === null) return false;
  if (runtime.instanceId !== null && ctx.scene.entity.get(runtime.instanceId) !== null) {
    ctx.scene.entity.despawn(runtime.instanceId);
  }
  const instanceId = spawnPetEntity(ctx, userId, def);
  if (instanceId === null) return false;
  runtime.instanceId = instanceId;
  runtime.dead = false;
  syncPet(ctx, userId);
  ctx.scene.entity.floatText({ instanceId: userId, text: `${def.name} revived`, kind: "info" });
  return true;
}

export function handlePetAbility(ctx: GameContext, userId: string, abilityId: string): boolean {
  switch (abilityId) {
    case PET_ABILITY_IDS.call_pet:
      return summonPet(ctx, userId, "pet_wolf");
    case PET_ABILITY_IDS.dismiss_pet:
      return dismissPet(ctx, userId);
    case PET_ABILITY_IDS.revive_pet:
      return revivePet(ctx, userId);
    case PET_ABILITY_IDS.summon_imp:
      return summonPet(ctx, userId, "pet_imp");
    case PET_ABILITY_IDS.summon_voidwalker:
      return summonPet(ctx, userId, "pet_voidwalker");
    case PET_ABILITY_IDS.summon_felhunter:
      return summonPet(ctx, userId, "pet_felhunter");
    case PET_ABILITY_IDS.summon_succubus:
      return summonPet(ctx, userId, "pet_succubus");
    default:
      return false;
  }
}

export function isPetAbility(abilityId: string): boolean {
  return (Object.values(PET_ABILITY_IDS) as string[]).includes(abilityId);
}

export function isPetInstance(ctx: GameContext, instanceId: string): boolean {
  for (const runtime of petsOf(ctx).values()) {
    if (runtime.instanceId === instanceId) return true;
  }
  return false;
}

export function tickPets(ctx: GameContext, userId: string, dt: number): void {
  const runtime = petsOf(ctx).get(userId);
  if (runtime === undefined || runtime.instanceId === null || runtime.dead) return;
  const def = petById(runtime.defId);
  const pet = ctx.scene.entity.get(runtime.instanceId);
  const owner = ctx.scene.entity.get(userId);
  if (def === null || pet === null || owner === null) {
    if (runtime.instanceId !== null) {
      runtime.dead = true;
      runtime.instanceId = null;
      syncPet(ctx, userId);
    }
    return;
  }
  const health = ctx.scene.entity.stats.get(runtime.instanceId, "health");
  if (health !== null && health.current <= 0) {
    ctx.scene.entity.despawn(runtime.instanceId);
    runtime.instanceId = null;
    runtime.dead = true;
    syncPet(ctx, userId);
    ctx.scene.entity.floatText({ instanceId: userId, text: `${def.name} died`, kind: "info" });
    return;
  }

  let targetId: string | null = ctx.scene.entity.getTarget(userId);
  if (targetId === null || !isMobInstance(ctx, targetId)) {
    const nearby = ctx.scene.entity.inRadius(pet.position, 16, (id) => isMobInstance(ctx, id));
    targetId = nearby[0] ?? null;
  }

  if (targetId !== null) {
    const dist = ctx.scene.entity.distance(runtime.instanceId, targetId);
    if (dist !== null && dist > 2.5) {
      ctx.scene.entity.moveTowardCommit(runtime.instanceId, targetId, {
        speed: def.moveSpeed,
        dt,
        stopDistance: 2.2,
        face: true,
        groundSnap: true,
      });
    } else if (dist !== null && dist <= 2.8) {
      const now = ctx.time.now();
      if (now >= runtime.nextSwingAt) {
        const level = ctx.scene.entity.stats.get(userId, "level")?.current ?? 1;
        const amount = Math.round(def.dmgBase + def.dmgPerLevel * (level - 1));
        ctx.scene.entity.effect({
          from: runtime.instanceId,
          to: targetId,
          effect: "damage",
          via: { amount },
        });
        addThreat(ctx, targetId, userId, amount * (def.role === "tank" ? 1.6 : 0.7));
        if (def.role === "tank") addThreat(ctx, targetId, runtime.instanceId, amount * 2);
        runtime.nextSwingAt = now + def.attackSpeed;
      }
    }
  } else {
    const follow = Math.hypot(pet.position[0] - owner.position[0], pet.position[2] - owner.position[2]);
    if (follow > 4) {
      ctx.scene.entity.moveTowardCommit(runtime.instanceId, userId, {
        speed: def.moveSpeed,
        dt,
        stopDistance: 2.8,
        groundSnap: true,
      });
    }
  }
  syncPet(ctx, userId);
}

export function resetPets(ctx: GameContext, userId?: string): void {
  if (userId !== undefined) {
    petsOf(ctx).delete(userId);
    return;
  }
  petsOf(ctx).clear();
}
