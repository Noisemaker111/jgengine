import { createDeathSystem, deathReasonFromEffect, type DeathSystem } from "../../combat/death";
import {
  createEffectSystem,
  type CombatSpatialDeps,
  type EffectSystem,
} from "../../combat/effects";
import { createProjectileSystem, type ProjectileSystem } from "../../combat/projectiles";
import type { PhysicsConfig } from "../../game/defineGame";
import type { GameEvents } from "../../game/events";
import { createVfxInstanceStore, type VfxInstanceStore } from "../../game/vfxInstance";
import type { LootRegistry } from "../../game/lootTable";
import type { EntityColliderSet } from "../../scene/colliders";
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
import { applyLethalLoot, isLocalPlayerKill } from "./deathLoot";

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
  runCommand: (name: string, args: unknown) => void;
  localUserId: string;
  physics?: PhysicsConfig;
}

/** @internal Effects, projectiles, death, and combat presentation surface. */
export interface CombatSubsystem {
  death: DeathSystem;
  effects: EffectSystem;
  floatingEffects: EffectSystem;
  projectiles: ProjectileSystem;
  combatFx: CombatFx;
  vfxInstances: VfxInstanceStore;
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
    localUserId,
  } = d;

  const death = createDeathSystem({
    resolveOnDeath: (instanceId) => catalogEntry(instanceId)?.onDeath,
    resolveIdentity(instanceId) {
      const entity = entities.get(instanceId);
      if (entity === null) return null;
      return {
        catalogId: entity.name,
        position: [entity.position[0], entity.position[1], entity.position[2]],
      };
    },
    loot: { roll: (tableId) => (lootRegistry.has(tableId) ? lootRegistry.roll(tableId) : []) },
    events,
    runCommand(name, args) {
      runCommand(name, args);
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
        return { catalogId: entity.name, name: entity.name };
      },
      onLethal(instanceId, lethalCtx) {
        // Capture identity + onDeath *before* resolveDeath despawns the entity.
        const dyingEntity = entities.get(instanceId);
        const catalogId = dyingEntity?.name;
        const position = dyingEntity?.position;
        const onDeath = catalogEntry(instanceId)?.onDeath;
        const reason = deathReasonFromEffect({
          ...lethalCtx,
          userIdOf: (id) => (id === localUserId ? localUserId : undefined),
        });
        const resolution = death.resolveDeath(instanceId, reason);
        if (resolution.status !== "resolved") return;
        applyLethalLoot({
          drops: resolution.drops,
          grantToLocalPlayer: isLocalPlayerKill(lethalCtx, localUserId),
          onDeath,
          position,
          catalogId,
          content,
          spawnWorldItem,
          grantToPlayer: loot.grantToPlayer,
          localUserId,
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

  const projectiles = notifyAfter(
    createProjectileSystem({
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
      onSettle(report) {
        events.emit("projectile.settled", {
          from: report.from,
          origin: [report.origin[0], report.origin[1], report.origin[2]],
          at: [report.at[0], report.at[1], report.at[2]],
          effect: report.effect,
          hit: report.hit,
          ballistic: report.ballistic,
        });
      },
    }),
    ["fireProjectile", "settleProjectile"],
    signalNotify,
  );

  return {
    death,
    effects,
    floatingEffects,
    projectiles,
    combatFx,
    vfxInstances,
  };
}
