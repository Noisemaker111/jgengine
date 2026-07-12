import { aimToPoint } from "@jgengine/core/input/pointer";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { cameraShake } from "@jgengine/shell/camera";
import { ffylPhase } from "../../handroll";
import { enemyById, type EnemyDef } from "./catalog";

const nextAttackAt = new Map<string, number>();
const nextNovaAt = new Map<string, number>();
const homes = new Map<string, EntityPosition>();
const wanderTargets = new Map<string, { target: EntityPosition; untilMs: number }>();

export const FLYNT_NOVA = { intervalMs: 7000, windupMs: 1500, radius: 4.2, damage: 40 };
export const LEASH_RADIUS = 46;

export function resetAiState(): void {
  nextAttackAt.clear();
  nextNovaAt.clear();
  homes.clear();
  wanderTargets.clear();
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
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function wander(ctx: GameContext, def: EnemyDef, id: string, position: EntityPosition, nowMs: number, dt: number): void {
  const home = homes.get(id) ?? position;
  let plan = wanderTargets.get(id);
  if (plan === undefined || nowMs > plan.untilMs) {
    const hash = idHash(`${id}:${Math.floor(nowMs / 4000)}`);
    const angle = ((hash % 360) / 360) * Math.PI * 2;
    const radius = 3 + (Math.abs(hash >> 4) % 6);
    plan = {
      target: [home[0] + Math.cos(angle) * radius, home[1], home[2] + Math.sin(angle) * radius],
      untilMs: nowMs + 3500 + (Math.abs(hash) % 2500),
    };
    wanderTargets.set(id, plan);
  }
  ctx.scene.entity.moveToward(id, plan.target, { speed: def.walkSpeed * 0.45, stopDistance: 0.6, dt });
}

function steerTarget(ctx: GameContext, enemyId: string, enemyPos: EntityPosition, playerPos: EntityPosition): EntityPosition {
  const [ox, oz] = flankOffset(enemyId, 2.4);
  const target: EntityPosition = [playerPos[0] + ox, playerPos[1], playerPos[2] + oz];
  const dx = target[0] - enemyPos[0];
  const dz = target[2] - enemyPos[2];
  const length = Math.hypot(dx, dz);
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
  ctx.scene.entity.effect({ from: enemyId, to: playerId, effect: "damage", via: { amount: def.attack.damage } });
  cameraShake(Math.min(0.5, def.attack.damage / 60));
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

function tickFlyntNova(ctx: GameContext, def: EnemyDef, enemyId: string, playerPos: EntityPosition, nowMs: number): void {
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
  const playerDowned = ffylPhase() === "downed";

  if (nextAttackAt.size > 512) {
    for (const key of nextAttackAt.keys()) {
      if (ctx.scene.entity.get(key) === null) nextAttackAt.delete(key);
    }
  }

  for (const entity of ctx.scene.entity.list()) {
    const def = enemyById(entity.name);
    if (def === undefined) continue;
    const home = homes.get(entity.id);
    if (home === undefined) rememberHome(entity.id, entity.position);
    const anchor = homes.get(entity.id) ?? entity.position;
    const playerDistance = distance2d(entity.position, playerPos);
    const leashed = distance2d(entity.position, anchor) > LEASH_RADIUS;
    const engaged = !playerDowned && !leashed && playerDistance <= def.aggroRadius;

    if (!engaged) {
      if (leashed) {
        ctx.scene.entity.moveToward(entity.id, anchor, { speed: def.walkSpeed, stopDistance: 2, dt });
      } else {
        wander(ctx, def, entity.id, entity.position, nowMs, dt);
      }
      continue;
    }

    if (def.attack.kind === "melee") {
      tickMelee(ctx, def, entity.id, entity.position, playerId, playerPos, dt, nowMs);
    } else {
      tickRanged(ctx, def, entity.id, entity.position, playerPos, dt, nowMs);
      tickFlyntNova(ctx, def, entity.id, playerPos, nowMs);
    }
  }
}
