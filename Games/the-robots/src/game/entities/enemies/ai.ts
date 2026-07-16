import { createMobBrain, type MobBrain } from "@jgengine/core/ai/mobBrain";
import { aimToPoint } from "@jgengine/core/input/pointer";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { distance as vecDistance, length as vecLength } from "@jgengine/core/world/vec2";
import { cameraShake } from "@jgengine/shell/camera";
import { ffylPhase } from "../../handroll";
import { zoneLevelAt } from "../../world/zones";
import { enemyById, levelDamageMult, type EnemyDef } from "./catalog";

const nextAttackAt = new Map<string, number>();
const nextNovaAt = new Map<string, number>();
const homes = new Map<string, EntityPosition>();
const brains = new Map<string, MobBrain>();

let activeCtx: GameContext | null = null;
let activePlayerId = "";
let playerDowned = false;

export const FLYNT_NOVA = { intervalMs: 7000, windupMs: 1500, radius: 4.2, damage: 40 };
export const LEASH_RADIUS = 46;

export function resetAiState(): void {
  nextAttackAt.clear();
  nextNovaAt.clear();
  homes.clear();
  brains.clear();
}

export function rememberHome(id: string, position: EntityPosition): void {
  homes.set(id, [position[0], position[1], position[2]]);
}

function idHash(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return hash;
}

function flankOffset(id: string, spread: number): readonly [number, number] {
  const hash = idHash(id);
  const angle = ((hash % 360) / 360) * Math.PI * 2;
  const radius = (Math.abs(hash >> 3) % 100) / 100;
  return [Math.cos(angle) * spread * radius, Math.sin(angle) * spread * radius];
}

function distance2d(a: EntityPosition, b: EntityPosition): number {
  return vecDistance([a[0], a[2]], [b[0], b[2]]);
}

function brainFor(def: EnemyDef, id: string): MobBrain {
  let brain = brains.get(id);
  if (brain === undefined) {
    const home = homes.get(id) ?? activeCtx?.scene.entity.get(id)?.position ?? [0, 0, 0];
    brain = createMobBrain(
      {
        aggroRadius: def.aggroRadius,
        attackRange: def.attack.kind === "melee" ? def.attack.reach : def.attack.preferRange,
        leashDistance: LEASH_RADIUS,
        wander: { radius: 9, intervalSeconds: 4, speedScale: 0.45, arriveRadius: 0.6 },
        evadeSpeedScale: 1,
        homeArriveRadius: 2,
      },
      {
        home: [home[0], home[1], home[2]],
        position: () => activeCtx?.scene.entity.get(id)?.position ?? null,
        targetPosition: (targetId) => {
          if (activeCtx === null) return null;
          if (playerDowned && targetId === activePlayerId) return null;
          return activeCtx.scene.entity.get(targetId)?.position ?? null;
        },
        candidates: () => (playerDowned ? [] : [activePlayerId]),
        rng: seededRng(`ai:${id}`),
      },
    );
    brains.set(id, brain);
  }
  return brain;
}

function steerTarget(ctx: GameContext, enemyId: string, enemyPos: EntityPosition, playerPos: EntityPosition): EntityPosition {
  const [ox, oz] = flankOffset(enemyId, 2.4);
  const target: EntityPosition = [playerPos[0] + ox, playerPos[1], playerPos[2] + oz];
  const dx = target[0] - enemyPos[0];
  const dz = target[2] - enemyPos[2];
  const length = vecLength([dx, dz]);
  if (length < 0.001) return target;
  const direction: EntityPosition = [dx / length, 0, dz / length];
  const blocked = ctx.scene.object.raycast({
    origin: [enemyPos[0], 0.6, enemyPos[2]],
    direction,
    maxDistance: 1.7,
  });
  if (blocked === null) return target;
  const side = idHash(enemyId) % 2 === 0 ? 1 : -1;
  return [enemyPos[0] - direction[2] * 3 * side, enemyPos[1], enemyPos[2] + direction[0] * 3 * side];
}

function tickMelee(
  ctx: GameContext,
  def: EnemyDef,
  enemyId: string,
  enemyPos: EntityPosition,
  playerId: string,
  playerPos: EntityPosition,
  dt: number,
  nowMs: number,
): void {
  if (def.attack.kind !== "melee") return;
  const distance = distance2d(enemyPos, playerPos);
  if (distance > def.attack.reach) {
    const target = steerTarget(ctx, enemyId, enemyPos, playerPos);
    ctx.scene.entity.moveToward(enemyId, target, { speed: def.walkSpeed, stopDistance: def.attack.reach * 0.6, dt });
    return;
  }
  const readyAt = nextAttackAt.get(enemyId) ?? 0;
  if (nowMs < readyAt) return;
  nextAttackAt.set(enemyId, nowMs + def.attack.intervalMs);
  ctx.game.playEntityAnimation(enemyId, "attack");
  const damage = Math.round(def.attack.damage * levelDamageMult(zoneLevelAt(enemyPos[0], enemyPos[2])));
  ctx.scene.entity.effect({ from: enemyId, to: playerId, effect: "damage", via: { amount: damage } });
  cameraShake(Math.min(0.5, damage / 60));
}

function tickRanged(
  ctx: GameContext,
  def: EnemyDef,
  enemyId: string,
  enemyPos: EntityPosition,
  playerPos: EntityPosition,
  dt: number,
  nowMs: number,
): void {
  if (def.attack.kind !== "ranged") return;
  const attack = def.attack;
  const distance = distance2d(enemyPos, playerPos);
  if (distance > attack.preferRange) {
    const target = steerTarget(ctx, enemyId, enemyPos, playerPos);
    ctx.scene.entity.moveToward(enemyId, target, { speed: def.walkSpeed, stopDistance: attack.preferRange * 0.8, dt });
  }
  const readyAt = nextAttackAt.get(enemyId) ?? 0;
  if (nowMs < readyAt) return;
  nextAttackAt.set(enemyId, nowMs + attack.intervalMs);
  ctx.game.playEntityAnimation(enemyId, "attack");
  const origin: EntityPosition = [enemyPos[0], enemyPos[1] + attack.eyeHeight, enemyPos[2]];
  const targetPoint: EntityPosition = [playerPos[0], playerPos[1] + 1.1, playerPos[2]];
  const shotId = ctx.scene.entity.fireProjectile({
    from: enemyId,
    via: { item: attack.itemId },
    aim: aimToPoint(origin, targetPoint),
    effect: "damage",
  });
  const flightSeconds = Math.min(1.2, distance / 28);
  const playerId = ctx.player.userId;
  ctx.time.after(flightSeconds, () => {
    const settled = ctx.scene.entity.settleProjectile(shotId);
    if (settled.status === "settled" && settled.hits.some((hit) => hit.instanceId === playerId)) {
      cameraShake(0.25);
    }
  });
}

function tickRuskNova(ctx: GameContext, def: EnemyDef, enemyId: string, playerPos: EntityPosition, nowMs: number): void {
  if (def.family !== "boss") return;
  const readyAt = nextNovaAt.get(enemyId);
  if (readyAt === undefined) {
    nextNovaAt.set(enemyId, nowMs + FLYNT_NOVA.intervalMs * 0.6);
    return;
  }
  if (nowMs < readyAt) return;
  nextNovaAt.set(enemyId, nowMs + FLYNT_NOVA.intervalMs);
  ctx.scene.entity.telegraph({
    from: enemyId,
    shape: { kind: "circle", radius: FLYNT_NOVA.radius },
    at: [playerPos[0], 0, playerPos[2]],
    windupMs: FLYNT_NOVA.windupMs,
    effect: { effect: "damage", via: { amount: FLYNT_NOVA.damage }, radius: FLYNT_NOVA.radius },
  });
}

export function tickEnemies(ctx: GameContext, dt: number): void {
  const playerId = ctx.player.userId;
  const playerEntity = ctx.scene.entity.get(playerId);
  if (playerEntity === null) return;
  const playerPos = playerEntity.position;
  const nowMs = ctx.time.now() * 1000;
  activeCtx = ctx;
  activePlayerId = playerId;
  playerDowned = ffylPhase() === "downed";

  if (nextAttackAt.size > 512) {
    for (const key of nextAttackAt.keys()) {
      if (ctx.scene.entity.get(key) === null) nextAttackAt.delete(key);
    }
  }

  for (const entity of ctx.scene.entity.list()) {
    const def = enemyById(entity.name);
    if (def === undefined) continue;
    if (!homes.has(entity.id)) rememberHome(entity.id, entity.position);
    const step = brainFor(def, entity.id).tick(dt);

    if (step.mode === "chase" || step.mode === "engage") {
      if (def.attack.kind === "melee") {
        tickMelee(ctx, def, entity.id, entity.position, playerId, playerPos, dt, nowMs);
      } else {
        tickRanged(ctx, def, entity.id, entity.position, playerPos, dt, nowMs);
        tickRuskNova(ctx, def, entity.id, playerPos, nowMs);
      }
    } else if (step.moveTo !== null) {
      const stopDistance = step.mode === "evade" ? 2 : 0.6;
      ctx.scene.entity.moveToward(entity.id, step.moveTo, { speed: def.walkSpeed * step.speedScale, stopDistance, dt });
    }

    const moved = ctx.scene.entity.get(entity.id);
    if (moved !== null) {
      const ground = ctx.world.groundHeightAt(moved.position[0], moved.position[2]);
      if (Math.abs(moved.position[1] - ground) > 0.05) {
        ctx.scene.entity.update(entity.id, { position: [moved.position[0], ground, moved.position[2]] });
      }
    }
  }
}
