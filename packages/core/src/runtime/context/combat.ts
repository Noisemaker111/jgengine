import { createDeathSystem, deathReasonFromEffect, type DeathSystem } from "../../combat/death";
import {
  createEffectSystem,
  type CombatSpatialDeps,
  type EffectSystem,
} from "../../combat/effects";
import { createProjectileSystem, type ProjectileSystem, type ProjectileTravelDeps, type ProjectileTravelImpact } from "../../combat/projectiles";
import type { PhysicsConfig } from "../../game/defineGame";
import type { GameEvents } from "../../game/events";
import { createVfxInstanceStore, type VfxInstanceStore } from "../../game/vfxInstance";
import type { LootRegistry } from "../../game/lootTable";
import { colliderBounds, colliderWorldCenter, defaultEntityColliders, resolveColliders, type EntityColliderSet, type ResolvedCollider } from "../../scene/colliders";
import { raycastCollisionMesh } from "../../scene/collisionMesh";
import { sweepMovingBounds, sweepMovingSphere } from "../../physics/ballisticSweep";
import type { EntityPosition } from "../../scene/entityStore";
import { createSpatialIndex } from "../../visibility/spatialIndex";
import type { EntityStore } from "../../scene/entityStore";
import { createEntityStatsApi } from "../../scene/entityStats";
import type { ObjectStore } from "../../scene/objectStore";
import type { SceneRaycastApi, SceneRaycastInput } from "../../scene/sceneRaycast";
import type { WeaponStats } from "../../item/weapon";
import type { SimClock } from "../../time/simClock";
import { notifyAfter } from "../../store/changeSignal";
import type { WorldItemRecord, WorldItemSpawnInput } from "../../game/worldItem";
import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextLoot,
} from "../gameContext";
import { createCombatFx, type CombatFx } from "./combatFx";
import { allowsUnownedWorldDrops, applyLethalLoot } from "./deathLoot";

/** @internal Wiring combat needs from the live scene, loot, and command seams. */
export interface CombatSubsystemDeps {
  content: GameContextContent;
  signalNotify: () => void;
  now: () => number;
  events: GameEvents;
  time: SimClock;
  entities: EntityStore;
  objects: ObjectStore;
  combatSpatial: CombatSpatialDeps;
  sceneRaycast: SceneRaycastApi;
  entityCollidersOf: (instanceId: string) => EntityColliderSet | null;
  objectCollidersOf: (instanceId: string) => EntityColliderSet | null;
  catalogEntry: (instanceId: string) => GameContextEntityEntry | null | undefined;
  statsByInstance: Map<string, import("../../scene/entityStats").StatValueMap>;
  weapon: WeaponStats;
  loot: GameContextLoot;
  lootRegistry: LootRegistry;
  spawnWorldItem: (input: WorldItemSpawnInput) => WorldItemRecord;
  despawnEntity: (instanceId: string) => boolean;
  runCommand: (name: string, args: unknown, actorUserId?: string) => void;
  userIdOf: (instanceId: string) => string | undefined;
  rng: () => number;
  physics?: PhysicsConfig;
  projectileTravel?: Pick<ProjectileTravelDeps, "acceleration" | "sweep" | "maxActive" | "maxRetained"> & {
    /** Bounded collision source; omit for the context's entities. */
    targets?(): readonly string[];
    /** Reject an oversized collision source rather than silently missing targets. Default 2048. */
    maxTargets?: number;
  };
}

/** @internal Effects, projectiles, death, and combat presentation surface. */
export interface CombatSubsystem {
  death: DeathSystem;
  effects: EffectSystem;
  floatingEffects: EffectSystem;
  projectiles: ProjectileSystem;
  combatFx: CombatFx;
  vfxInstances: VfxInstanceStore;
  captureProjectileTargets(gameDt: number): void;
}

/** @internal */
export function createCombatSubsystem(d: CombatSubsystemDeps): CombatSubsystem {
  const {
    content,
    signalNotify,
    now,
    events,
    time,
    entities,
    objects,
    combatSpatial,
    sceneRaycast,
    entityCollidersOf,
    objectCollidersOf,
    catalogEntry,
    statsByInstance,
    weapon,
    loot,
    lootRegistry,
    spawnWorldItem,
    despawnEntity,
    runCommand,
    userIdOf,
    rng,
  } = d;

  const death = createDeathSystem({
    resolveOnDeath(instanceId, reason) {
      const spec = catalogEntry(instanceId)?.onDeath;
      if (reason !== undefined && reason.kind !== "player_kill" && allowsUnownedWorldDrops(spec)) {
        // Explicit opt-in must not enable neighboring legacy/unfiltered tables.
        return {
          ...spec,
          drops: Array.isArray(spec?.drops)
            ? spec.drops.filter((rule) => rule.when?.reason === "any") : [],
        };
      }
      return spec;
    },
    resolveIdentity(instanceId) {
      const entity = entities.get(instanceId);
      if (entity === null) return null;
      const userId = userIdOf(instanceId);
      return {
        catalogId: entity.name,
        position: [entity.position[0], entity.position[1], entity.position[2]],
        ...(userId === undefined ? {} : { userId }),
      };
    },
    loot: { roll: (tableId) => (lootRegistry.has(tableId) ? lootRegistry.roll(tableId) : []) },
    events,
    runCommand(name, args, reason) {
      runCommand(name, args, reason?.kind === "player_kill" ? reason.killerUserId : undefined);
    },
    despawn(instanceId) {
      despawnEntity(instanceId);
    },
  });

  const effects = notifyAfter(
    createEffectSystem({
      resolveReceive: (instanceId) => catalogEntry(instanceId)?.receive,
      statPools: createEntityStatsApi((instanceId) => statsByInstance.get(instanceId)),
      getStat: weapon.getStat,
      spatial: combatSpatial,
      resolveSlainIdentity(instanceId) {
        const entity = entities.get(instanceId);
        if (entity === null) return null;
        // `entity.name` is the spawn kind/catalog id, matching the `entity.died` event.
        const userId = userIdOf(instanceId);
        return { catalogId: entity.name, name: entity.name, ...(userId === undefined ? {} : { userId }) };
      },
      onLethal(instanceId, lethalCtx) {
        // Capture identity + onDeath *before* resolveDeath despawns the entity.
        const dyingEntity = entities.get(instanceId);
        const catalogId = dyingEntity?.name;
        const position = dyingEntity?.position;
        const onDeath = catalogEntry(instanceId)?.onDeath;
        const reason = deathReasonFromEffect({
          ...lethalCtx,
          userIdOf,
        });
        const resolution = death.resolveDeath(instanceId, reason);
        if (resolution.status !== "resolved") return;
        applyLethalLoot({
          drops: resolution.drops,
          recipientUserId: reason.kind === "player_kill" ? reason.killerUserId : undefined,
          allowUnownedWorldDrops: reason.kind !== "player_kill" && allowsUnownedWorldDrops(onDeath),
          onDeath,
          position,
          catalogId,
          content,
          spawnWorldItem,
          grantToPlayer: loot.grantToPlayer,
          rng,
        });
      },
    }),
    ["applyEffect"],
    signalNotify,
  );

  const combatFx = createCombatFx({
    entities,
    events,
    time,
    applyEffect: (input) => effects.applyEffect(input),
  });

  const vfxInstances = createVfxInstanceStore({
    onOp: (op) => events.emit("combat.vfxInstance", op),
    now: () => time.now() * 1000,
  });

  const floatingEffects: EffectSystem = {
    canReceive: effects.canReceive,
    preview: effects.preview,
    applyEffect: combatFx.applyEffectAndFloat,
  };

  const projectileObstacles = d.physics?.projectileObstacles === true;
  const projectileFilterFor = (filter: SceneRaycastInput["filter"]): SceneRaycastInput["filter"] => ({
    entities: true,
    objects: projectileObstacles,
    terrain: false,
    walls: projectileObstacles,
    ...filter,
  });
  const projectileSceneRaycast: SceneRaycastApi = {
    raycast(input) {
      return sceneRaycast.raycast({ ...input, filter: projectileFilterFor(input.filter) });
    },
    raycastAll(input) {
      return sceneRaycast.raycastAll({ ...input, filter: projectileFilterFor(input.filter) });
    },
  };

  const travelQueries = createProjectileTravelQueries(d);

  const projectileOwner = createProjectileSystem({
      effects: floatingEffects,
      spatial: combatSpatial,
      getStat: weapon.getStat,
      sceneRaycast: projectileSceneRaycast,
      objects: projectileObstacles
        ? {
            list: () => objects.list(),
            inBox: (min, max) => objects.inBox(min, max),
            halfExtents: (catalogId) => {
              const half = content.objectById?.(catalogId)?.halfExtents;
              return half === undefined ? null : [half[0], half[1], half[2]];
            },
            collidersOf: objectCollidersOf,
          }
        : undefined,
      entityCollidersOf,
      rotationYOf: (instanceId) => entities.get(instanceId)?.rotationY,
      now,
      rng,
      travel: { ...d.projectileTravel, now: time.now, sweep: d.projectileTravel?.sweep ?? travelQueries.sweep },
      onSettle(report) {
        events.emit("projectile.settled", {
          shotId: report.shotId,
          hits: structuredClone(report.hits),
          from: report.from,
          origin: [report.origin[0], report.origin[1], report.origin[2]],
          at: [report.at[0], report.at[1], report.at[2]],
          effect: report.effect,
          hit: report.hit,
          ballistic: report.ballistic,
        });
      },
    });
  const resettingProjectileOwner: ProjectileSystem = {
    ...projectileOwner,
    restore(state) {
      projectileOwner.restore(state);
      travelQueries.reset();
    },
  };
  const projectiles = notifyAfter(
    resettingProjectileOwner,
    ["fireProjectile", "settleProjectile", "restore"],
    signalNotify,
  );

  return {
    death,
    effects,
    floatingEffects,
    projectiles,
    combatFx,
    vfxInstances,
    captureProjectileTargets(gameDt) { travelQueries.capture(gameDt, projectiles.activeProjectiles().length > 0); },
  };
}

/** Derived collision scratch data is rebuilt from the scene each authoritative step. */
function createProjectileTravelQueries(d: CombatSubsystemDeps) {
  const { entities, time, sceneRaycast, entityCollidersOf } = d;
  const projectileObstacles = d.physics?.projectileObstacles === true;
  const previousTargets = new Map<string, { position: EntityPosition; rotationY: number }>();
  const maxTargets = d.projectileTravel?.maxTargets ?? 2048;
  if (!Number.isInteger(maxTargets) || maxTargets <= 0) throw new RangeError("Projectile collision budget must be a positive integer");
  const targetIndex = createSpatialIndex();
  const targetColliders = new Map<string, ResolvedCollider[]>();
  const targetCandidates: string[] = [];
  let targetIndexReady = false;
  let targetStepStart = 0;
  let targetStepDuration = 0;

  function captureProjectileTargets(gameDt: number, active: boolean) {
    previousTargets.clear();
    targetIndexReady = false;
    targetStepDuration = gameDt;
    targetStepStart = time.now() - gameDt;
    if (!active) return;
    const ids = d.projectileTravel?.targets?.() ?? entities.ids();
    if (ids.length > maxTargets) throw new RangeError("Projectile collision target budget exhausted; provide a bounded target source");
    for (const id of ids) {
      const entity = entities.get(id);
      if (entity !== null) previousTargets.set(id, { position: [...entity.position], rotationY: entity.rotationY });
    }
  }

  function indexProjectileTargets() {
    if (targetIndexReady) return;
    targetIndex.clear();
    targetColliders.clear();
    const ids = d.projectileTravel?.targets?.() ?? entities.ids();
    if (ids.length > maxTargets) throw new RangeError("Projectile collision target budget exhausted; provide a bounded target source");
    for (const id of ids) {
      const entity = entities.get(id);
      if (entity === null) continue;
      const previous = previousTargets.get(id);
      const colliders = resolveColliders(entityCollidersOf(id) ?? defaultEntityColliders());
      targetColliders.set(id, colliders);
      let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const collider of colliders) {
        const start = colliderBounds(collider, previous?.position ?? entity.position, previous?.rotationY ?? entity.rotationY);
        const end = colliderBounds(collider, entity.position, entity.rotationY);
        minX = Math.min(minX, start.min[0], end.min[0]); minY = Math.min(minY, start.min[1], end.min[1]); minZ = Math.min(minZ, start.min[2], end.min[2]);
        maxX = Math.max(maxX, start.max[0], end.max[0]); maxY = Math.max(maxY, start.max[1], end.max[1]); maxZ = Math.max(maxZ, start.max[2], end.max[2]);
      }
      if (colliders.length > 0) targetIndex.insert(id, { minX, minY, minZ, maxX, maxY, maxZ, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, centerZ: (minZ + maxZ) / 2, radius: Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2 });
    }
    targetIndexReady = true;
  }

  function sweepProjectile(from: EntityPosition, to: EntityPosition, step: Parameters<NonNullable<ProjectileTravelDeps["sweep"]>>[2]): ProjectileTravelImpact | null {
    if (projectileObstacles && step.radius > 0) throw new RangeError("Authored cover requires centerline projectiles (radius 0); inject a radius-aware travel sweep for larger projectiles");
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const staticHits = distance > 0 ? sceneRaycast.raycastAll({ origin: from, direction: [to[0] - from[0], to[1] - from[1], to[2] - from[2]], maxDistance: distance, excludeInstanceIds: [step.input.from], filter: { entities: false, objects: projectileObstacles, walls: projectileObstacles, terrain: projectileObstacles } }) : [];
    const blocker = staticHits.find(hit => hit.blocks);
    let nearest: ProjectileTravelImpact | null = blocker === undefined ? null : { fraction: blocker.distance / distance, at: blocker.point };
    let nearestKey = blocker === undefined ? "" : `${blocker.instanceId}:${blocker.colliderName}`;
    indexProjectileTargets();
    const radius = step.radius;
    const ids = targetIndex.queryBox(Math.min(from[0], to[0]) - radius, Math.min(from[1], to[1]) - radius, Math.min(from[2], to[2]) - radius, Math.max(from[0], to[0]) + radius, Math.max(from[1], to[1]) + radius, Math.max(from[2], to[2]) + radius, targetCandidates);
    for (const id of ids) {
      if (id === step.input.from) continue;
      const entity = entities.get(id);
      if (entity === null) continue;
      const previous = previousTargets.get(id);
      const fractionAt = (at: number) => targetStepDuration > 0 ? Math.max(0, Math.min(1, (at - targetStepStart) / targetStepDuration)) : 1;
      const positionAt = (at: number): EntityPosition => {
        if (previous === undefined) return entity.position;
        const alpha = fractionAt(at);
        return [previous.position[0] + (entity.position[0] - previous.position[0]) * alpha, previous.position[1] + (entity.position[1] - previous.position[1]) * alpha, previous.position[2] + (entity.position[2] - previous.position[2]) * alpha];
      };
      const colliders = targetColliders.get(id)!;
      for (const collider of colliders) {
        if (!collider.blocks && !collider.damageEligible) continue;
        const targetFrom = colliderWorldCenter(collider, positionAt(step.fromTime), previous?.rotationY ?? entity.rotationY);
        const targetTo = colliderWorldCenter(collider, positionAt(step.toTime), entity.rotationY);
        let fraction: number | null;
        if (collider.shape.kind === "sphere") {
          fraction = sweepMovingSphere(from, to, targetFrom, targetTo, collider.shape.radius + step.radius);
        } else if (collider.shape.kind === "mesh" && step.radius === 0) {
          const start = positionAt(step.fromTime);
          const end = positionAt(step.toTime);
          const origin: EntityPosition = [from[0] + end[0] - start[0], from[1] + end[1] - start[1], from[2] + end[2] - start[2]];
          const motion: EntityPosition = [to[0] - origin[0], to[1] - origin[1], to[2] - origin[2]];
          const length = Math.hypot(...motion);
          const hit = length > 0 ? raycastCollisionMesh(collider.shape.mesh, origin, [motion[0] / length, motion[1] / length, motion[2] / length], length, end, entity.rotationY, collider.shape.meshScale, collider.shape.meshTranslate) : null;
          fraction = hit === null ? null : hit.distance / length;
        } else {
          const half = collider.shape.halfExtents;
          fraction = sweepMovingBounds(from, to, targetFrom, targetTo, [half[0] + step.radius, half[1] + step.radius, half[2] + step.radius]);
        }
        const key = `${id}:${collider.name}`;
        if (fraction === null || (nearest !== null && (fraction > nearest.fraction || (fraction === nearest.fraction && key >= nearestKey)))) continue;
        nearestKey = key;
        nearest = {
          fraction, at: [from[0] + (to[0] - from[0]) * fraction, from[1] + (to[1] - from[1]) * fraction, from[2] + (to[2] - from[2]) * fraction],
          target: { kind: "entity", instanceId: id, distance: distance * fraction, colliderName: collider.name, damageEligible: collider.damageEligible },
        };
      }
    }
    return nearest;
  }

  return {
    capture: captureProjectileTargets,
    sweep: sweepProjectile,
    reset() {
      previousTargets.clear();
      targetIndex.clear();
      targetColliders.clear();
      targetCandidates.length = 0;
      targetIndexReady = false;
      targetStepStart = 0;
      targetStepDuration = 0;
    },
  };
}
