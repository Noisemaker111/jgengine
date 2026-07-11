import { createThreatTable, type ThreatTable } from "@jgengine/core/ai/threat";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { LEASH_DISTANCE, mitigate, mobDamage, mobHp } from "../math/combat";
import type { MobDef } from "../model";
import { MOBS, mobById } from "../entities/enemies/catalog";
import { aurasOf, enterCombat, gainRage, heroSheet, storeKeys } from "../session/hero";
import { dungeonById } from "../dungeons/catalog";
import { CRYPT, zoneById } from "../world/zones";
import { HIT_TAKEN_RAGE } from "../combat/engine";

interface MobRuntime {
  defId: string;
  level: number;
  spawn: readonly [number, number, number];
  threat: ThreatTable;
  evading: boolean;
  nextSwingAt: number;
  nextWanderAt: number;
  wanderTo: readonly [number, number] | null;
  frenzyUntil: number;
  nextAbilityAt: number;
  telegraphedAt: number;
  stunnedUntil: number;
  rootedUntil: number;
  enraged: boolean;
  nextSummonAt: number;
  summonedIds: string[];
  noRespawn?: boolean;
}

const runtimes = new Map<string, MobRuntime>();
const CRYPT_MOB_IDS = new Set(["crypt_shambler", "hollow_acolyte", "sexton_marrow", "morthen"]);
const AGGRO_INTEREST = 130;
const MELEE_REACH = 2.6;
const RESPAWN_SEC = 35;

export function isMobInstance(instanceId: string): boolean {
  return runtimes.has(instanceId);
}

export function mobRuntimeOf(instanceId: string): { defId: string; level: number } | null {
  const runtime = runtimes.get(instanceId);
  return runtime === undefined ? null : { defId: runtime.defId, level: runtime.level };
}

export function levelOfMob(instanceId: string): number {
  return runtimes.get(instanceId)?.level ?? 1;
}

export function armorOfMob(instanceId: string): number {
  const runtime = runtimes.get(instanceId);
  if (runtime === undefined) return 0;
  const def = mobById(runtime.defId);
  const base = def === null ? 0 : def.armorPerLevel * runtime.level;
  const shred = aurasOf(instanceId).reduce(
    (sum, aura) => (aura.buffStat === "armor" ? sum + (aura.buffAmount ?? 0) : sum),
    0,
  );
  return Math.max(0, base + shred);
}

export function addThreat(instanceId: string, sourceId: string, amount: number): void {
  const runtime = runtimes.get(instanceId);
  if (runtime === undefined || runtime.evading) return;
  runtime.threat.add(sourceId, amount);
}

function placementFor(def: MobDef, roll: () => number, index: number): readonly [number, number] {
  const dungeon = def.dungeonId === undefined ? null : dungeonById(def.dungeonId);
  if (dungeon !== null) {
    if (def.boss === true) return [dungeon.center[0], dungeon.center[1] + 4];
    const angle = roll() * Math.PI * 2;
    const radius = 5 + roll() * Math.max(4, dungeon.radius - 9);
    return [dungeon.center[0] + Math.cos(angle) * radius, dungeon.center[1] + Math.sin(angle) * radius];
  }
  if (CRYPT_MOB_IDS.has(def.id)) {
    if (def.id === "morthen") return [CRYPT.x, CRYPT.z + 6];
    const angle = roll() * Math.PI * 2;
    const radius = 6 + roll() * (CRYPT.radius - 10);
    return [CRYPT.x + Math.cos(angle) * radius, CRYPT.z + Math.sin(angle) * radius];
  }
  const zone = zoneById(def.zone);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const x = -168 + roll() * 336;
    const z = zone.zMin + 14 + roll() * (zone.zMax - zone.zMin - 28);
    const hub = zone.hub;
    const hubDist = Math.hypot(x - hub.x, z - hub.z);
    const graveDist = Math.hypot(x - zone.graveyard.x, z - zone.graveyard.z);
    const cryptDist = Math.hypot(x - CRYPT.x, z - CRYPT.z);
    if (hubDist > hub.radius + 14 && graveDist > 14 && cryptDist > CRYPT.radius + 8) return [x, z];
  }
  return [zone.hub.x + 40 + index * 3, (zone.zMin + zone.zMax) / 2];
}

export function spawnMobAt(
  ctx: GameContext,
  def: MobDef,
  position: readonly [number, number],
  level: number,
  options?: { noRespawn?: boolean },
): string {
  const y = ctx.world.groundHeightAt(position[0], position[1]);
  const instanceId = ctx.scene.entity.spawn(def.id, { position: [position[0], y, position[1]] });
  ctx.scene.entity.stats.set(instanceId, "level", { current: level });
  const hp = mobHp(def.hpBase, def.hpPerLevel, level);
  ctx.scene.entity.stats.set(instanceId, "health", { max: hp, current: hp });
  runtimes.set(instanceId, {
    defId: def.id,
    level,
    spawn: [position[0], y, position[1]],
    threat: createThreatTable({ decayPerSecond: 1, forgetBelow: 0.5 }),
    evading: false,
    nextSwingAt: 0,
    nextWanderAt: 0,
    wanderTo: null,
    frenzyUntil: 0,
    nextAbilityAt: 0,
    telegraphedAt: 0,
    stunnedUntil: 0,
    rootedUntil: 0,
    enraged: false,
    nextSummonAt: 0,
    summonedIds: [],
    noRespawn: options?.noRespawn === true,
  });
  return instanceId;
}

function spawnMob(ctx: GameContext, def: MobDef, position: readonly [number, number], level: number): string {
  return spawnMobAt(ctx, def, position, level);
}

export function applyMobCc(
  ctx: GameContext,
  instanceId: string,
  sourceId: string,
  cc: { kind: "stun" | "root" | "taunt" | "armorShred"; durationSec: number },
): boolean {
  const runtime = runtimes.get(instanceId);
  if (runtime === undefined || runtime.evading) return false;
  const now = ctx.time.now();
  if (cc.kind === "stun") {
    runtime.stunnedUntil = Math.max(runtime.stunnedUntil, now + cc.durationSec);
    ctx.scene.entity.floatText({ instanceId, text: "Stunned", kind: "info" });
  } else if (cc.kind === "root") {
    runtime.rootedUntil = Math.max(runtime.rootedUntil, now + cc.durationSec);
    ctx.scene.entity.floatText({ instanceId, text: "Rooted", kind: "info" });
  } else if (cc.kind === "taunt") {
    runtime.threat.taunt(sourceId, cc.durationSec);
  }
  return true;
}

export function spawnAllMobs(ctx: GameContext): number {
  let spawned = 0;
  for (const def of MOBS) {
    const roll = seededRng(`spawn:${def.id}`);
    for (let index = 0; index < def.count; index += 1) {
      const level = def.minLevel + Math.floor(roll() * (def.maxLevel - def.minLevel + 1));
      spawnMob(ctx, def, placementFor(def, roll, index), level);
      spawned += 1;
    }
  }
  return spawned;
}

export function onMobDied(ctx: GameContext, instanceId: string): { defId: string; level: number } | null {
  const runtime = runtimes.get(instanceId);
  if (runtime === undefined) return null;
  runtimes.delete(instanceId);
  const def = mobById(runtime.defId);
  if (def !== null && def.rare !== true && def.boss !== true && runtime.noRespawn !== true) {
    const respawnAt: readonly [number, number] = [runtime.spawn[0], runtime.spawn[2]];
    ctx.time.after(RESPAWN_SEC, () => {
      spawnMob(ctx, def, respawnAt, runtime.level);
    });
  }
  return { defId: runtime.defId, level: runtime.level };
}

export function despawnMob(ctx: GameContext, instanceId: string): void {
  if (!runtimes.has(instanceId)) return;
  runtimes.delete(instanceId);
  if (ctx.scene.entity.get(instanceId) !== null) ctx.scene.entity.despawn(instanceId);
}

function socialPull(ctx: GameContext, def: MobDef, instanceId: string, targetId: string): void {
  const self = ctx.scene.entity.get(instanceId);
  if (self === null) return;
  const radius = def.packFrenzy?.radius ?? (def.family === "humanoid" || def.family === "undead" ? 10 : 0);
  if (radius === 0) return;
  for (const allyId of ctx.scene.entity.inRadius(self.position, radius, isMobInstance)) {
    if (allyId === instanceId) continue;
    const ally = runtimes.get(allyId);
    if (ally === undefined || ally.defId !== def.id || ally.evading) continue;
    if (ally.threat.highest() === null) ally.threat.add(targetId, 1);
    if (def.packFrenzy !== undefined) ally.frenzyUntil = ctx.time.now() + def.packFrenzy.duration;
  }
}

function swingAtPlayer(ctx: GameContext, def: MobDef, runtime: MobRuntime, instanceId: string, targetId: string): void {
  const now = ctx.time.now();
  if (now < runtime.nextSwingAt) return;
  const sheet = heroSheet(ctx, targetId);
  const weakenPct = aurasOf(instanceId).reduce(
    (sum, aura) => (aura.buffStat === "attackPower" && (aura.buffAmount ?? 0) < 0 ? sum + (aura.buffAmount ?? 0) : sum),
    0,
  );
  const enrage = runtime.enraged ? def.mechanics?.enrage : undefined;
  const raw = Math.max(
    1,
    Math.round(
      mobDamage(def.dmgBase, def.dmgPerLevel, runtime.level) *
        Math.max(0.3, (100 + weakenPct) / 100) *
        (enrage?.damageMult ?? 1),
    ),
  );
  const amount = mitigate(raw, sheet?.armor ?? 0, runtime.level);
  ctx.scene.entity.effect({ from: instanceId, to: targetId, effect: "damage", via: { amount } });
  gainRage(ctx, targetId, HIT_TAKEN_RAGE);
  enterCombat(ctx, targetId);
  const haste =
    (now < runtime.frenzyUntil ? (def.packFrenzy?.hasteMult ?? 1) : 1) * (enrage?.hasteMult ?? 1);
  runtime.nextSwingAt = now + def.attackSpeed / haste;
}

function castMobAbility(ctx: GameContext, def: MobDef, runtime: MobRuntime, instanceId: string): void {
  const ability = def.abilities?.[0];
  if (ability === undefined) return;
  const now = ctx.time.now();
  if (runtime.nextAbilityAt === 0) runtime.nextAbilityAt = now + ability.intervalSec;
  if (now < runtime.nextAbilityAt) return;
  const self = ctx.scene.entity.get(instanceId);
  if (self === null) return;
  runtime.nextAbilityAt = now + ability.intervalSec;
  const at: [number, number, number] = [self.position[0], self.position[1], self.position[2]];
  ctx.scene.entity.telegraph({
    from: instanceId,
    shape: { kind: "circle", radius: ability.radius ?? 8 },
    at,
    windupMs: 1500,
    kind: ability.school,
    effect: { effect: "damage", via: { amount: ability.amount }, radius: ability.radius ?? 8 },
  });
}

function runBossMechanics(
  ctx: GameContext,
  def: MobDef,
  runtime: MobRuntime,
  instanceId: string,
  targetId: string,
  now: number,
): void {
  const mechanics = def.mechanics;
  if (mechanics === undefined) return;
  if (mechanics.enrage !== undefined && !runtime.enraged) {
    const health = ctx.scene.entity.stats.get(instanceId, "health");
    if (health !== null && health.max > 0 && health.current / health.max <= mechanics.enrage.belowHpFraction) {
      runtime.enraged = true;
      ctx.scene.entity.floatText({ instanceId, text: `${def.name} enrages!`, kind: "info", scale: 1.4 });
    }
  }
  const summons = mechanics.summons;
  if (summons !== undefined) {
    if (runtime.nextSummonAt === 0) runtime.nextSummonAt = now + summons.intervalSec;
    if (now >= runtime.nextSummonAt) {
      runtime.nextSummonAt = now + summons.intervalSec;
      runtime.summonedIds = runtime.summonedIds.filter((id) => ctx.scene.entity.get(id) !== null);
      const room = (summons.maxAlive ?? 4) - runtime.summonedIds.length;
      const addDef = mobById(summons.mobId);
      const self = ctx.scene.entity.get(instanceId);
      if (addDef === null || self === null || room <= 0) return;
      for (let index = 0; index < Math.min(room, summons.count); index += 1) {
        const angle = (index / summons.count) * Math.PI * 2;
        const addId = spawnMob(
          ctx,
          addDef,
          [self.position[0] + Math.cos(angle) * 3, self.position[2] + Math.sin(angle) * 3],
          Math.max(addDef.minLevel, runtime.level - 1),
        );
        const addRuntime = runtimes.get(addId);
        addRuntime?.threat.add(targetId, 5);
        runtime.summonedIds.push(addId);
      }
      ctx.scene.entity.floatText({ instanceId, text: "Rise!", kind: "info" });
    }
  }
}

function moveMob(
  ctx: GameContext,
  instanceId: string,
  target: readonly [number, number, number] | string,
  speed: number,
  dt: number,
  stopDistance: number,
): void {
  const next = ctx.scene.entity.moveToward(instanceId, target as [number, number, number] | string, {
    speed,
    dt,
    stopDistance,
  });
  if (next === null) return;
  const self = ctx.scene.entity.get(instanceId);
  if (self === null) return;
  const dx = next[0] - self.position[0];
  const dz = next[2] - self.position[2];
  const grounded: [number, number, number] = [next[0], ctx.world.groundHeightAt(next[0], next[2]), next[2]];
  const rotationY = Math.abs(dx) + Math.abs(dz) > 0.0001 ? Math.atan2(dx, dz) : self.rotationY;
  ctx.scene.entity.setPose(instanceId, { position: grounded, rotationY, dt });
}

export function tickMobs(ctx: GameContext, dt: number): void {
  const playerId = ctx.player.userId;
  const playerDead = ctx.game.store.get(storeKeys.dead(playerId)) === true;
  const player = ctx.scene.entity.get(playerId);
  const now = ctx.time.now();
  for (const [instanceId, runtime] of runtimes) {
    const def = mobById(runtime.defId);
    const self = ctx.scene.entity.get(instanceId);
    if (def === null || self === null) continue;
    if (runtime.evading) {
      const home = runtime.spawn;
      const distHome = Math.hypot(self.position[0] - home[0], self.position[2] - home[2]);
      if (distHome < 1.2) {
        runtime.evading = false;
        const maxHp = ctx.scene.entity.stats.get(instanceId, "health")?.max ?? 1;
        ctx.scene.entity.stats.set(instanceId, "health", { current: maxHp });
      } else {
        moveMob(ctx, instanceId, home, def.moveSpeed * 1.4, dt, 0);
      }
      continue;
    }
    if (player === null || playerDead) {
      runtime.threat.clear();
    }
    const playerDist =
      player === null ? Number.POSITIVE_INFINITY : Math.hypot(self.position[0] - player.position[0], self.position[2] - player.position[2]);
    if (playerDist > AGGRO_INTEREST) continue;
    runtime.threat.decay(dt);
    let targetId = runtime.threat.highest({ stickiness: 1.15 });
    if (targetId === null && player !== null && !playerDead) {
      const playerLevel = ctx.scene.entity.stats.get(playerId, "level")?.current ?? 1;
      const aggroRadius = Math.max(4, def.aggroRadius + Math.min(4, Math.max(-4, runtime.level - playerLevel)));
      if (playerDist <= aggroRadius) {
        runtime.threat.add(playerId, 1);
        targetId = playerId;
        socialPull(ctx, def, instanceId, playerId);
        if (def.packFrenzy !== undefined) runtime.frenzyUntil = now + def.packFrenzy.duration;
      }
    }
    if (targetId !== null && (ctx.scene.entity.get(targetId) === null || playerDead)) {
      runtime.threat.clear();
      targetId = null;
    }
    if (targetId !== null) {
      if (now < runtime.stunnedUntil) continue;
      const distHome = Math.hypot(self.position[0] - runtime.spawn[0], self.position[2] - runtime.spawn[2]);
      if (distHome > LEASH_DISTANCE) {
        runtime.threat.clear();
        runtime.evading = true;
        continue;
      }
      const targetDist = ctx.scene.entity.distance(instanceId, targetId);
      if (targetDist === null) continue;
      if (targetDist > MELEE_REACH) {
        if (now >= runtime.rootedUntil) {
          moveMob(ctx, instanceId, targetId, def.moveSpeed, dt, MELEE_REACH - 0.4);
        }
      } else {
        swingAtPlayer(ctx, def, runtime, instanceId, targetId);
      }
      if (def.abilities !== undefined) castMobAbility(ctx, def, runtime, instanceId);
      if (def.mechanics !== undefined) runBossMechanics(ctx, def, runtime, instanceId, targetId, now);
      continue;
    }
    if (now >= runtime.nextWanderAt) {
      runtime.nextWanderAt = now + 3 + (instanceId.length % 4);
      const roll = Math.sin(now * 13.37 + instanceId.length) * 0.5 + 0.5;
      const angle = roll * Math.PI * 2;
      runtime.wanderTo = [runtime.spawn[0] + Math.cos(angle) * 8, runtime.spawn[2] + Math.sin(angle) * 8];
    }
    if (runtime.wanderTo !== null) {
      const [wx, wz] = runtime.wanderTo;
      const wanderDist = Math.hypot(self.position[0] - wx, self.position[2] - wz);
      if (wanderDist < 0.6) runtime.wanderTo = null;
      else moveMob(ctx, instanceId, [wx, ctx.world.groundHeightAt(wx, wz), wz], def.moveSpeed * 0.35, dt, 0);
    }
  }
}

export function mobCount(): number {
  return runtimes.size;
}

export function resetMobs(): void {
  runtimes.clear();
}
