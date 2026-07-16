import { createMobBrain, type MobBrain } from "@jgengine/core/ai/mobBrain";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { LEASH_DISTANCE, mitigate, mobDamage, mobHp } from "../math/combat";
import type { MobDef } from "../model";
import { MOBS, mobById } from "../entities/enemies/catalog";
import { aurasOf, enterCombat, gainRage, heroSheet } from "../session/hero";
import { deadStore } from "../session/stores";
import { dungeonById } from "../dungeons/catalog";
import { CRYPT, zoneById } from "../world/zones";
import { HIT_TAKEN_RAGE } from "../combat/engine";

interface MobRuntime {
  defId: string;
  level: number;
  spawn: readonly [number, number, number];
  brain: MobBrain;
  nextSwingAt: number;
  frenzyUntil: number;
  abilityAt: Map<string, number>;
  telegraphedAt: number;
  stunnedUntil: number;
  rootedUntil: number;
  enraged: boolean;
  nextSummonAt: number;
  summonedIds: string[];
  noRespawn?: boolean;
}

const runtimesOf = perContext(() => new Map<string, MobRuntime>());
const CRYPT_MOB_IDS = new Set(["crypt_shambler", "hollow_acolyte", "sexton_marrow", "morthen"]);
const AGGRO_INTEREST = 130;
const MELEE_REACH = 2.6;
const RESPAWN_SEC = 35;
const WORLD_HALF_WIDTH = 168;
const WORLD_WIDTH = WORLD_HALF_WIDTH * 2;
const ZONE_EDGE_MARGIN = 14;

export function isMobInstance(ctx: GameContext, instanceId: string): boolean {
  return runtimesOf(ctx).has(instanceId);
}

export function mobRuntimeOf(
  ctx: GameContext,
  instanceId: string,
): { defId: string; level: number } | null {
  const runtime = runtimesOf(ctx).get(instanceId);
  return runtime === undefined ? null : { defId: runtime.defId, level: runtime.level };
}

export function levelOfMob(ctx: GameContext, instanceId: string): number {
  return runtimesOf(ctx).get(instanceId)?.level ?? 1;
}

export function armorOfMob(ctx: GameContext, instanceId: string): number {
  const runtime = runtimesOf(ctx).get(instanceId);
  if (runtime === undefined) return 0;
  const def = mobById(runtime.defId);
  const base = def === null ? 0 : def.armorPerLevel * runtime.level;
  const shred = aurasOf(ctx, instanceId).reduce(
    (sum, aura) => (aura.buffStat === "armor" ? sum + (aura.buffAmount ?? 0) : sum),
    0,
  );
  return Math.max(0, base + shred);
}

export function addThreat(ctx: GameContext, instanceId: string, sourceId: string, amount: number): void {
  const runtime = runtimesOf(ctx).get(instanceId);
  if (runtime === undefined) return;
  runtime.brain.addThreat(sourceId, amount);
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
    const x = -WORLD_HALF_WIDTH + roll() * WORLD_WIDTH;
    const z = zone.zMin + ZONE_EDGE_MARGIN + roll() * (zone.zMax - zone.zMin - ZONE_EDGE_MARGIN * 2);
    const hub = zone.hub;
    const hubDist = Math.hypot(x - hub.x, z - hub.z);
    const graveDist = Math.hypot(x - zone.graveyard.x, z - zone.graveyard.z);
    const cryptDist = Math.hypot(x - CRYPT.x, z - CRYPT.z);
    if (hubDist > hub.radius + ZONE_EDGE_MARGIN && graveDist > ZONE_EDGE_MARGIN && cryptDist > CRYPT.radius + 8) return [x, z];
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
  const spawn: readonly [number, number, number] = [position[0], y, position[1]];
  const brain = createMobBrain(
    {
      aggroRadius: 0,
      attackRange: MELEE_REACH,
      leashDistance: LEASH_DISTANCE,
      stickiness: 1.15,
      wander: { radius: 8, speedScale: 0.35, arriveRadius: 0.6, intervalSeconds: 3 + (instanceId.length % 4) },
      threat: { decayPerSecond: 1, forgetBelow: 0.5 },
    },
    {
      home: spawn,
      position: () => ctx.scene.entity.get(instanceId)?.position ?? null,
      targetPosition: (targetId) => ctx.scene.entity.get(targetId)?.position ?? null,
      candidates: () => [],
      rng: seededRng(`wander:${instanceId}`),
    },
  );
  runtimesOf(ctx).set(instanceId, {
    defId: def.id,
    level,
    spawn,
    brain,
    nextSwingAt: 0,
    frenzyUntil: 0,
    abilityAt: new Map(),
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
  const runtime = runtimesOf(ctx).get(instanceId);
  if (runtime === undefined || runtime.brain.mode() === "evade") return false;
  const now = ctx.time.now();
  if (cc.kind === "stun") {
    runtime.stunnedUntil = Math.max(runtime.stunnedUntil, now + cc.durationSec);
    ctx.scene.entity.floatText({ instanceId, text: "Stunned", kind: "info" });
  } else if (cc.kind === "root") {
    runtime.rootedUntil = Math.max(runtime.rootedUntil, now + cc.durationSec);
    ctx.scene.entity.floatText({ instanceId, text: "Rooted", kind: "info" });
  } else if (cc.kind === "taunt") {
    runtime.brain.threat.taunt(sourceId, cc.durationSec);
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
  const runtime = runtimesOf(ctx).get(instanceId);
  if (runtime === undefined) return null;
  runtimesOf(ctx).delete(instanceId);
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
  const runtimes = runtimesOf(ctx);
  if (!runtimes.has(instanceId)) return;
  runtimes.delete(instanceId);
  if (ctx.scene.entity.get(instanceId) !== null) ctx.scene.entity.despawn(instanceId);
}

function socialPull(ctx: GameContext, def: MobDef, instanceId: string, targetId: string): void {
  const self = ctx.scene.entity.get(instanceId);
  if (self === null) return;
  const radius = def.packFrenzy?.radius ?? (def.family === "humanoid" || def.family === "undead" ? 10 : 0);
  if (radius === 0) return;
  for (const allyId of ctx.scene.entity.inRadius(self.position, radius, (id) => isMobInstance(ctx, id))) {
    if (allyId === instanceId) continue;
    const ally = runtimesOf(ctx).get(allyId);
    if (ally === undefined || ally.defId !== def.id || ally.brain.mode() === "evade") continue;
    if (ally.brain.threat.highest() === null) ally.brain.addThreat(targetId, 1);
    if (def.packFrenzy !== undefined) ally.frenzyUntil = ctx.time.now() + def.packFrenzy.duration;
  }
}

function swingAtPlayer(ctx: GameContext, def: MobDef, runtime: MobRuntime, instanceId: string, targetId: string): void {
  const now = ctx.time.now();
  if (now < runtime.nextSwingAt) return;
  const sheet = heroSheet(ctx, targetId);
  const weakenPct = aurasOf(ctx, instanceId).reduce(
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
  const abilities = def.abilities;
  if (abilities === undefined) return;
  const now = ctx.time.now();
  const self = ctx.scene.entity.get(instanceId);
  if (self === null) return;
  for (const ability of abilities) {
    const nextAt = runtime.abilityAt.get(ability.id);
    if (nextAt === undefined) {
      runtime.abilityAt.set(ability.id, now + ability.intervalSec);
      continue;
    }
    if (now < nextAt) continue;
    runtime.abilityAt.set(ability.id, now + ability.intervalSec);
    const at: [number, number, number] = [self.position[0], self.position[1], self.position[2]];
    ctx.scene.entity.telegraph({
      from: instanceId,
      shape: { kind: "circle", radius: ability.radius ?? 8 },
      at,
      windupMs: ability.windupMs ?? 1500,
      kind: ability.school,
      effect: { effect: "damage", via: { amount: ability.amount }, radius: ability.radius ?? 8 },
    });
  }
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
        const addRuntime = runtimesOf(ctx).get(addId);
        addRuntime?.brain.addThreat(targetId, 5);
        runtime.summonedIds.push(addId);
      }
      ctx.scene.entity.floatText({ instanceId, text: "Rise!", kind: "info" });
    }
  }
}

export function tickMobs(ctx: GameContext, dt: number): void {
  const playerId = ctx.player.userId;
  const playerDead = deadStore.read(ctx, playerId);
  const player = ctx.scene.entity.get(playerId);
  const now = ctx.time.now();
  for (const [instanceId, runtime] of runtimesOf(ctx)) {
    const def = mobById(runtime.defId);
    const self = ctx.scene.entity.get(instanceId);
    if (def === null || self === null) continue;
    const brain = runtime.brain;
    if (brain.mode() !== "evade") {
      if (player === null || playerDead) brain.threat.clear();
      const playerDist =
        player === null
          ? Number.POSITIVE_INFINITY
          : Math.hypot(self.position[0] - player.position[0], self.position[2] - player.position[2]);
      if (playerDist > AGGRO_INTEREST) continue;
      if (brain.threat.highest({ stickiness: 1.15 }) === null && player !== null && !playerDead) {
        const playerLevel = ctx.scene.entity.stats.get(playerId, "level")?.current ?? 1;
        const aggroRadius = Math.max(4, def.aggroRadius + Math.min(4, Math.max(-4, runtime.level - playerLevel)));
        if (playerDist <= aggroRadius) {
          brain.addThreat(playerId, 1);
          socialPull(ctx, def, instanceId, playerId);
          if (def.packFrenzy !== undefined) runtime.frenzyUntil = now + def.packFrenzy.duration;
        }
      }
    }
    const step = brain.tick(dt);
    if (step.arrivedHome) {
      const maxHp = ctx.scene.entity.stats.get(instanceId, "health")?.max ?? 1;
      ctx.scene.entity.stats.set(instanceId, "health", { current: maxHp });
    }
    if (step.targetId !== null && now < runtime.stunnedUntil) continue;
    if (step.moveTo !== null) {
      const chasing = step.mode === "chase";
      if (!(chasing && now < runtime.rootedUntil)) {
        ctx.scene.entity.moveTowardCommit(instanceId, step.moveTo, {
          speed: def.moveSpeed * step.speedScale,
          dt,
          stopDistance: chasing ? MELEE_REACH - 0.4 : 0,
          face: true,
          groundSnap: true,
        });
      }
    }
    if (step.inAttackRange && step.targetId !== null) {
      swingAtPlayer(ctx, def, runtime, instanceId, step.targetId);
    }
    if (step.targetId !== null) {
      if (def.abilities !== undefined) castMobAbility(ctx, def, runtime, instanceId);
      if (def.mechanics !== undefined) runBossMechanics(ctx, def, runtime, instanceId, step.targetId, now);
    }
  }
}

export function mobCount(ctx: GameContext): number {
  return runtimesOf(ctx).size;
}

export function resetMobs(ctx: GameContext): void {
  runtimesOf(ctx).clear();
}
