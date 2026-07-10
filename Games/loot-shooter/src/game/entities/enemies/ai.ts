import { aimToPoint } from "@jgengine/core/input/pointer";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { SOUND_IDS } from "../../audio/catalog";
import { shakeOnPlayerDamage } from "../../feel";
import { enemyById, type EnemyDef } from "./catalog";

const nextAttackAt = new Map<string, number>();
const nextMortarAt = new Map<string, number>();

export const MORTAR = { intervalMs: 6500, windupMs: 1400, radius: 3.6, damage: 32 };

export function resetAiState(): void {
  nextAttackAt.clear();
  nextMortarAt.clear();
}

function idHash(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return hash;
}

function flankOffset(id: string, spread: number): readonly [number, number] {
  const hash = idHash(id);
  const angle = ((hash % 360) / 360) * Math.PI * 2;
  const radius = (Math.abs(hash >> 3) % 100) / 100;
  return [Math.cos(angle) * spread * radius, Math.sin(angle) * spread * radius];
}

function steerTarget(
  ctx: GameContext,
  enemyId: string,
  enemyPos: EntityPosition,
  playerPos: EntityPosition,
): EntityPosition {
  const [ox, oz] = flankOffset(enemyId, 2.2);
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
  const distance = Math.hypot(playerPos[0] - enemyPos[0], playerPos[2] - enemyPos[2]);
  if (distance > def.attack.reach) {
    const target = steerTarget(ctx, enemyId, enemyPos, playerPos);
    ctx.scene.entity.moveToward(enemyId, target, {
      speed: def.walkSpeed,
      stopDistance: def.attack.reach * 0.6,
      dt,
    });
    return;
  }
  const readyAt = nextAttackAt.get(enemyId) ?? 0;
  if (nowMs < readyAt) return;
  nextAttackAt.set(enemyId, nowMs + def.attack.intervalMs);
  ctx.scene.entity.effect({
    from: enemyId,
    to: playerId,
    effect: "damage",
    via: { amount: def.attack.damage },
  });
  shakeOnPlayerDamage(def.attack.damage);
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
  const distance = Math.hypot(playerPos[0] - enemyPos[0], playerPos[2] - enemyPos[2]);
  if (distance > attack.preferRange) {
    const target = steerTarget(ctx, enemyId, enemyPos, playerPos);
    ctx.scene.entity.moveToward(enemyId, target, {
      speed: def.walkSpeed,
      stopDistance: attack.preferRange * 0.8,
      dt,
    });
  }
  const readyAt = nextAttackAt.get(enemyId) ?? 0;
  if (nowMs < readyAt) return;
  nextAttackAt.set(enemyId, nowMs + attack.intervalMs);
  const origin: EntityPosition = [enemyPos[0], enemyPos[1] + attack.eyeHeight, enemyPos[2]];
  const targetPoint: EntityPosition = [playerPos[0], playerPos[1] + 1.1, playerPos[2]];
  ctx.game.events.emit("audio.play", { sound: "enemy_bolt", at: origin });
  const shotId = ctx.scene.entity.fireProjectile({
    from: enemyId,
    via: { item: attack.itemId },
    aim: aimToPoint(origin, targetPoint),
    effect: "damage",
  });
  const speed = 26;
  const flightSeconds = Math.min(1.2, distance / speed);
  const playerId = ctx.player.userId;
  ctx.time.after(flightSeconds, () => {
    const settled = ctx.scene.entity.settleProjectile(shotId);
    if (settled.status === "settled" && settled.hits.some((hit) => hit.instanceId === playerId)) {
      shakeOnPlayerDamage(12);
    }
  });
}

function tickMortar(
  ctx: GameContext,
  def: EnemyDef,
  enemyId: string,
  playerPos: EntityPosition,
  nowMs: number,
): void {
  if (def.family !== "boss") return;
  const readyAt = nextMortarAt.get(enemyId) ?? nowMs + MORTAR.intervalMs * 0.6;
  if (nextMortarAt.get(enemyId) === undefined) {
    nextMortarAt.set(enemyId, readyAt);
    return;
  }
  if (nowMs < readyAt) return;
  nextMortarAt.set(enemyId, nowMs + MORTAR.intervalMs);
  ctx.game.events.emit("audio.play", { sound: SOUND_IDS.mortarWarn, at: playerPos });
  ctx.scene.entity.telegraph({
    from: enemyId,
    shape: { kind: "circle", radius: MORTAR.radius },
    at: [playerPos[0], 0, playerPos[2]],
    windupMs: MORTAR.windupMs,
    effect: { effect: "damage", via: { amount: MORTAR.damage }, radius: MORTAR.radius },
  });
}

export function tickEnemies(ctx: GameContext, dt: number): void {
  const playerId = ctx.player.userId;
  const playerEntity = ctx.scene.entity.get(playerId);
  if (playerEntity === null) return;
  const playerPos = playerEntity.position;
  const nowMs = ctx.time.now() * 1000;

  if (nextAttackAt.size > 512) {
    for (const key of nextAttackAt.keys()) {
      if (ctx.scene.entity.get(key) === null) nextAttackAt.delete(key);
    }
  }

  for (const entity of ctx.scene.entity.list()) {
    const def = enemyById(entity.name);
    if (def === undefined) continue;
    if (def.attack.kind === "melee") {
      tickMelee(ctx, def, entity.id, entity.position, playerId, playerPos, dt, nowMs);
    } else {
      tickRanged(ctx, def, entity.id, entity.position, playerPos, dt, nowMs);
      tickMortar(ctx, def, entity.id, playerPos, nowMs);
    }
  }
}
