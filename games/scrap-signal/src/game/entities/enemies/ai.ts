import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";
import type { EntityPosition } from "@jgengine/core/scene/entityStore";
import { reservePhase } from "../../handroll";
import { zoneLevelAt } from "../../world/zones";
import { huntTargetFor, isFrontUnit } from "../../encounters/front";
import { enemyById, levelDamageMult, type EnemyDef } from "./catalog";
import {
  homeOf,
  pruneAttackCadence,
  rememberHome,
  tickEnemyAttack,
} from "./behavior";
import { createBossAuraField, reconcileBossAuras, type BossSample } from "./hazardAura";

/** Per-session enemy AI bookkeeping — keyed by context so it is reclaimed with the world (#632). */
const bossAuraFieldOf = perContext(() => createBossAuraField());
const nextNovaAtOf = perContext(() => new Map<string, number>());
const wanderTargetsOf = perContext(() => new Map<string, { target: EntityPosition; untilMs: number }>());
/** Ids currently engaged, so the alert bark fires on the transition rather than every tick. */
const engagedOf = perContext(() => new Set<string>());

export const RUSK_NOVA = { intervalMs: 7000, windupMs: 1500, radius: 4.2, damage: 40 };
export const LEASH_RADIUS = 46;

export { rememberHome };

function idHash(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return hash;
}

function distance2d(a: EntityPosition, b: EntityPosition): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function wander(ctx: GameContext, def: EnemyDef, id: string, position: EntityPosition, nowMs: number, dt: number): void {
  const home = homeOf(ctx, id) ?? position;
  let plan = wanderTargetsOf(ctx).get(id);
  if (plan === undefined || nowMs > plan.untilMs) {
    const hash = idHash(`${id}:${Math.floor(nowMs / 4000)}`);
    const angle = ((hash % 360) / 360) * Math.PI * 2;
    const radius = 3 + (Math.abs(hash >> 4) % 6);
    plan = {
      target: [home[0] + Math.cos(angle) * radius, home[1], home[2] + Math.sin(angle) * radius],
      untilMs: nowMs + 3500 + (Math.abs(hash) % 2500),
    };
    wanderTargetsOf(ctx).set(id, plan);
  }
  ctx.scene.entity.moveTowardCommit(id, plan.target, { speed: def.walkSpeed * 0.45, stopDistance: 0.6, dt });
}

function tickRuskNova(ctx: GameContext, def: EnemyDef, enemyId: string, playerPos: EntityPosition, nowMs: number): void {
  if (def.family !== "boss") return;
  const readyAt = nextNovaAtOf(ctx).get(enemyId);
  if (readyAt === undefined) {
    nextNovaAtOf(ctx).set(enemyId, nowMs + RUSK_NOVA.intervalMs * 0.6);
    return;
  }
  if (nowMs < readyAt) return;
  nextNovaAtOf(ctx).set(enemyId, nowMs + RUSK_NOVA.intervalMs);
  ctx.scene.entity.telegraph({
    from: enemyId,
    shape: { kind: "circle", radius: RUSK_NOVA.radius },
    at: [playerPos[0], 0, playerPos[2]],
    windupMs: RUSK_NOVA.windupMs,
    effect: { effect: "damage", via: { amount: RUSK_NOVA.damage }, radius: RUSK_NOVA.radius },
  });
}

export function tickEnemies(ctx: GameContext, dt: number): void {
  const playerId = ctx.player.userId;
  const playerEntity = ctx.scene.entity.get(playerId);
  if (playerEntity === null) return;
  const playerPos = playerEntity.position;
  const nowMs = ctx.time.now() * 1000;
  const playerDowned = reservePhase(ctx) === "downed";

  pruneAttackCadence(ctx);

  const bossSamples: BossSample[] = [];
  for (const entity of ctx.scene.entity.list()) {
    const def = enemyById(entity.name);
    if (def === undefined) continue;
    // A fighter the front is driving already has its orders; the zone AI must not fight it for the wheel.
    if (isFrontUnit(ctx, entity.id)) continue;
    const home = homeOf(ctx, entity.id);
    if (home === undefined) rememberHome(ctx, entity.id, entity.position);
    const anchor = homeOf(ctx, entity.id) ?? entity.position;
    if (def.family === "boss") {
      bossSamples.push({ id: entity.id, position: entity.position, level: zoneLevelAt(entity.position[0], entity.position[2]) });
    }

    // A shot pulls a nearby enemy off its post: it walks to where it last heard, and when the
    // memory has faded it goes back to wandering or to its leash. No second give-up timer lives here.
    const heardAt = huntTargetFor(ctx, entity.id);
    if (heardAt !== null && distance2d(anchor, heardAt) <= LEASH_RADIUS) {
      ctx.scene.entity.moveTowardCommit(entity.id, heardAt, { speed: def.walkSpeed, stopDistance: 1.4, dt });
      continue;
    }

    const playerDistance = distance2d(entity.position, playerPos);
    const leashed = distance2d(entity.position, anchor) > LEASH_RADIUS;
    const engaged = !playerDowned && !leashed && playerDistance <= def.aggroRadius;

    if (engaged !== engagedOf(ctx).has(entity.id)) {
      if (engaged) {
        engagedOf(ctx).add(entity.id);
        ctx.game.audio.play("bark_alert", entity.position);
      } else {
        engagedOf(ctx).delete(entity.id);
      }
    }

    if (!engaged) {
      if (leashed) {
        ctx.scene.entity.moveTowardCommit(entity.id, anchor, { speed: def.walkSpeed, stopDistance: 2, dt });
      } else {
        wander(ctx, def, entity.id, entity.position, nowMs, dt);
      }
      continue;
    }

    tickEnemyAttack(ctx, def, entity.id, entity.position, playerId, playerPos, dt, nowMs);
    if (def.attack.kind === "ranged") tickRuskNova(ctx, def, entity.id, playerPos, nowMs);

    const moved = ctx.scene.entity.get(entity.id);
    if (moved !== null) {
      const ground = ctx.world.groundHeightAt(moved.position[0], moved.position[2]);
      if (Math.abs(moved.position[1] - ground) > 0.05) {
        ctx.scene.entity.update(entity.id, { position: [moved.position[0], ground, moved.position[2]] });
      }
    }
  }

  // Continuous boss "overload" auras: source-following damage fields that follow each boss and shock
  // the player standing inside on a fixed cadence, cleaned up automatically when a boss dies.
  const auraTarget = playerDowned ? null : { id: playerId, position: playerPos };
  for (const hit of reconcileBossAuras(bossAuraFieldOf(ctx), bossSamples, auraTarget, dt * 1000, levelDamageMult)) {
    ctx.scene.entity.effect({ from: hit.bossId, to: playerId, effect: "damage", via: { amount: hit.amount } });
  }
}
