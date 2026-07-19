import type { CombatSpatialDeps } from "../../combat/effects";
import type { GameEvents } from "../../game/events";
import { createBodyBind, type BodyBind } from "../../scene/bodyBind";
import {
  createEntityStatsApi,
  seedStatValues,
  type EntityStatsApi,
  type StatValueMap,
} from "../../scene/entityStats";
import {
  createEntityStore,
  type EntityPosition,
  type EntityStore,
  type SceneEntity,
  type SpawnOptions,
} from "../../scene/entityStore";
import { createForms, type Forms } from "../../scene/form";
import {
  fittedEntityColliders,
  fittedObjectColliders,
  hasMeshColliderShape,
  measuredEntityColliders,
  measuredObjectColliders,
  meshEntityColliders,
  meshObjectColliders,
  scaledEntityColliders,
  scaledObjectColliders,
  type EntityColliderSet,
  type MeasuredBounds,
} from "../../scene/colliders";
import { prepareCollisionMeshSource, type CollisionMeshSource } from "../../scene/collisionMesh";
import { raycastObjects, raycastObjectsAll } from "../../scene/objectQuery";
import { createObjectStore, objectVisualScale, type ObjectStore } from "../../scene/objectStore";
import { createPaintLayer, type PaintLayer } from "../../scene/paintLayer";
import { createSelectionSet } from "../../scene/selection";
import {
  createSceneRaycast,
  type SceneRaycastApi,
} from "../../scene/sceneRaycast";
import { createSpatialApi, type SpatialApi } from "../../scene/spatial";
import { createTargeting, type Targeting } from "../../scene/targeting";
import type { TerrainField } from "../../world/terrain";
import type { SimClock } from "../../time/simClock";
import { notifyAfter } from "../../store/changeSignal";
import type {
  GameContextContent,
  GameContextEntityEntry,
  GameContextModels,
  GameContextObjectEntry,
  MoveTowardCommitOptions,
  SceneObjectContext,
} from "../gameContext";

/** @internal Live scene stores + spatial/collider/raycast wiring handed in by `createGameContext`. */
export interface SceneSubsystemDeps {
  content: GameContextContent;
  signalNotify: () => void;
  ground: TerrainField;
  events: GameEvents;
  /** Full sim clock — forms need `after` for timed shapeshift reversion. */
  time: SimClock;
  occluder?: (from: EntityPosition, to: EntityPosition) => boolean;
  models?: GameContextModels;
}

/** @internal Always-on scene surface: entities, objects, colliders, spatial, raycast, targeting. */
export interface SceneSubsystem {
  entities: EntityStore;
  objects: ObjectStore;
  statsByInstance: Map<string, StatValueMap>;
  entityStats: EntityStatsApi;
  ensureInstanceStats: (instanceId: string) => StatValueMap;
  catalogEntry: (instanceId: string) => GameContextEntityEntry | null | undefined;
  catalogObject: (instanceId: string) => GameContextObjectEntry | null | undefined;
  spatial: SpatialApi;
  combatSpatial: CombatSpatialDeps;
  sceneRaycast: SceneRaycastApi;
  targeting: Targeting;
  entityColliders: Map<string, EntityColliderSet>;
  objectColliders: Map<string, EntityColliderSet>;
  entityCollidersOf: (instanceId: string) => EntityColliderSet | null;
  objectCollidersOf: (instanceId: string) => EntityColliderSet | null;
  reportEntityBounds: (kind: string, bounds: MeasuredBounds | null) => boolean;
  reportEntityCollisionMesh: (kind: string, mesh: CollisionMeshSource | null) => boolean;
  entityVisualScaleOf: (instanceId: string) => number;
  forms: Forms;
  paintLayer: PaintLayer;
  spawnEntity: (name: string, spawnOptions?: SpawnOptions) => string;
  despawnEntity: (instanceId: string) => boolean;
  moveEntityTowardCommit: (
    instanceId: string,
    target: EntityPosition | string,
    options: MoveTowardCommitOptions,
  ) => EntityPosition | null;
  resetAllToSpawn: (filter?: (entity: SceneEntity) => boolean) => number;
  bind: (key: string) => BodyBind;
  sceneObjects: SceneObjectContext;
  /** Install post-spawn side effects (death.revive) after combat is constructed. */
  setOnAfterSpawn: (fn: (instanceId: string) => void) => void;
  /** Install post-despawn side effects (pose.clear) after player is constructed. */
  setOnAfterDespawn: (fn: (instanceId: string) => void) => void;
}

/** @internal */
export function createSceneSubsystem(d: SceneSubsystemDeps): SceneSubsystem {
  const { content, signalNotify, ground, events, time, occluder } = d;

  const entities = createEntityStore();
  const objects = createObjectStore();
  entities.subscribe(signalNotify);
  objects.subscribe(signalNotify);

  const statsByInstance = new Map<string, StatValueMap>();
  const entityStats = notifyAfter(
    createEntityStatsApi((instanceId) => statsByInstance.get(instanceId)),
    ["set", "delta"],
    signalNotify,
  );

  function ensureInstanceStats(instanceId: string): StatValueMap {
    let map = statsByInstance.get(instanceId);
    if (map === undefined) {
      map = {};
      statsByInstance.set(instanceId, map);
    }
    return map;
  }

  function catalogEntry(instanceId: string): GameContextEntityEntry | null | undefined {
    const entity = entities.get(instanceId);
    return entity === null ? undefined : content.entityById?.(entity.name);
  }

  function catalogObject(instanceId: string): GameContextObjectEntry | null | undefined {
    const object = objects.get(instanceId);
    return object === null ? undefined : content.objectById?.(object.catalogId);
  }

  let spatialGeneration = 0;
  const candidateIds: string[] = [];
  let candidateIdsDirty = true;

  function refreshCandidateIds(): readonly string[] {
    if (!candidateIdsDirty) return candidateIds;
    candidateIds.length = 0;
    for (const entity of entities.list()) candidateIds.push(entity.id);
    candidateIdsDirty = false;
    return candidateIds;
  }

  const spatial = createSpatialApi({
    resolvePosition: (instanceId) => entities.get(instanceId)?.position,
    candidates: refreshCandidateIds,
    grid: { cellSize: 8 },
    getVersion: () => spatialGeneration,
    ...(occluder !== undefined ? { occluder } : {}),
  });

  entities.subscribe(() => {
    candidateIdsDirty = true;
    spatialGeneration += 1;
    spatial.invalidate();
  });

  const entityColliders = new Map<string, EntityColliderSet>();
  const objectColliders = new Map<string, EntityColliderSet>();
  const fittedEntityByKind = new Map<string, EntityColliderSet | null>();
  const fittedObjectByCatalogId = new Map<string, EntityColliderSet | null>();

  function fittedEntitySetFor(kind: string): EntityColliderSet | null {
    const cached = fittedEntityByKind.get(kind);
    if (cached !== undefined) return cached;
    const model = d.models?.entity?.(kind);
    const fitted = model === null || model === undefined ? null : fittedEntityColliders(model);
    fittedEntityByKind.set(kind, fitted);
    return fitted;
  }

  function fittedObjectSetFor(catalogId: string): EntityColliderSet | null {
    const cached = fittedObjectByCatalogId.get(catalogId);
    if (cached !== undefined) return cached;
    const model = d.models?.object?.(catalogId);
    const fitted = model === null || model === undefined ? null : fittedObjectColliders(model);
    fittedObjectByCatalogId.set(catalogId, fitted);
    return fitted;
  }

  const measuredEntityByKind = new Map<string, EntityColliderSet>();
  const measuredObjectByCatalogId = new Map<string, EntityColliderSet>();

  function reportEntityBounds(kind: string, bounds: MeasuredBounds | null): boolean {
    if (bounds === null) {
      const existed = measuredEntityByKind.delete(kind);
      if (existed) signalNotify();
      return existed;
    }
    const measured = measuredEntityColliders(bounds);
    if (measured === null) return false;
    measuredEntityByKind.set(kind, measured);
    signalNotify();
    return true;
  }

  const meshEntityByKind = new Map<string, EntityColliderSet>();
  const meshObjectByCatalogId = new Map<string, EntityColliderSet>();

  function reportEntityCollisionMesh(kind: string, mesh: CollisionMeshSource | null): boolean {
    if (mesh === null) {
      const existed = meshEntityByKind.delete(kind);
      if (existed) signalNotify();
      return existed;
    }
    const prepared = prepareCollisionMeshSource(mesh);
    const set = prepared === null ? null : meshEntityColliders(prepared);
    if (set === null) return false;
    meshEntityByKind.set(kind, set);
    signalNotify();
    return true;
  }

  function reportObjectCollisionMesh(catalogId: string, mesh: CollisionMeshSource | null): boolean {
    if (mesh === null) {
      const existed = meshObjectByCatalogId.delete(catalogId);
      if (existed) signalNotify();
      return existed;
    }
    const prepared = prepareCollisionMeshSource(mesh);
    const set = prepared === null ? null : meshObjectColliders(prepared);
    if (set === null) return false;
    meshObjectByCatalogId.set(catalogId, set);
    signalNotify();
    return true;
  }

  function reportObjectBounds(catalogId: string, bounds: MeasuredBounds | null): boolean {
    if (bounds === null) {
      const existed = measuredObjectByCatalogId.delete(catalogId);
      if (existed) signalNotify();
      return existed;
    }
    const measured = measuredObjectColliders(bounds);
    if (measured === null) return false;
    measuredObjectByCatalogId.set(catalogId, measured);
    signalNotify();
    return true;
  }

  function entityCollidersOf(instanceId: string): EntityColliderSet | null {
    const override = entityColliders.get(instanceId);
    if (override !== undefined) return override;
    const entry = catalogEntry(instanceId);
    if (entry?.colliders !== undefined) return entry.colliders;
    const kind = entities.get(instanceId)?.name;
    if (kind !== undefined) {
      const fitted = fittedEntitySetFor(kind);
      // Index-derived mesh shapes win (identical on a headless host); otherwise a runtime-reported
      // collision mesh upgrades the fitted/measured bounding box to the rendered triangles.
      if (fitted !== null && hasMeshColliderShape(fitted)) return fitted;
      const runtimeMesh = meshEntityByKind.get(kind);
      if (runtimeMesh !== undefined) return runtimeMesh;
      if (fitted !== null) return fitted;
      const measured = measuredEntityByKind.get(kind);
      if (measured !== undefined) return measured;
    }
    const scale = entry?.scale;
    if (scale !== undefined && scale !== 1) return scaledEntityColliders(scale);
    return null;
  }

  function entityVisualScaleOf(instanceId: string): number {
    return catalogEntry(instanceId)?.scale ?? 1;
  }

  function objectCollidersOf(instanceId: string): EntityColliderSet | null {
    const override = objectColliders.get(instanceId);
    if (override !== undefined) return override;
    const catalog = catalogObject(instanceId);
    if (catalog?.colliders !== undefined) return catalog.colliders;
    if (catalog?.halfExtents !== undefined) return null;
    const object = objects.get(instanceId);
    if (object === null) return null;
    const fitted = fittedObjectSetFor(object.catalogId);
    if (fitted !== null && hasMeshColliderShape(fitted)) return fitted;
    const runtimeMesh = meshObjectByCatalogId.get(object.catalogId);
    if (runtimeMesh !== undefined) return runtimeMesh;
    if (fitted !== null) return fitted;
    const measured = measuredObjectByCatalogId.get(object.catalogId);
    if (measured !== undefined) return measured;
    if (object.visual?.scale === undefined) return null;
    return scaledObjectColliders(objectVisualScale(object.visual));
  }

  const targeting = notifyAfter(
    createTargeting({
      candidates: () => [...refreshCandidateIds()],
      classify(_fromId, toId) {
        const role = catalogEntry(toId)?.role;
        return role === "enemy" || role === "hostile" ? "hostile" : "friendly";
      },
      distance: (fromId, toId) => spatial.distance(fromId, toId),
    }),
    ["setTarget", "cycleTarget"],
    signalNotify,
  );

  const combatSpatial: CombatSpatialDeps = {
    inRadius: (center, radius) => spatial.inRadius(center, radius),
    hasLineOfSight: (from, to) => {
      if (typeof from === "string") return spatial.hasLineOfSight(from, to);
      const toPos = entities.get(to)?.position;
      if (toPos === undefined) return false;
      if (occluder === undefined) return true;
      return !occluder(from, toPos);
    },
    positionOf: (instanceId) => entities.get(instanceId)?.position,
  };

  const sceneRaycast: SceneRaycastApi = createSceneRaycast({
    entities: {
      list: () =>
        entities.list().map((entity) => ({
          id: entity.id,
          position: entity.position,
          rotationY: entity.rotationY,
          name: entity.name,
        })),
      collidersOf: entityCollidersOf,
      inRadius: (center, radius) => spatial.inRadius(center, radius),
      get: (id) => {
        const entity = entities.get(id);
        if (entity === null) return null;
        return { id: entity.id, position: entity.position, rotationY: entity.rotationY, name: entity.name };
      },
    },
    objects: {
      list: () => objects.list(),
      inBox: (min, max) => objects.inBox(min, max),
      collidersOf: objectCollidersOf,
      halfExtentsOf: (catalogId) => content.objectById?.(catalogId)?.halfExtents ?? null,
    },
    terrain: ground,
  });

  const forms = notifyAfter(createForms({ entities, time, events }), ["shapeshift", "revert"], signalNotify);
  const paintLayer = notifyAfter(createPaintLayer(), ["paint", "clear"], signalNotify);

  let onAfterSpawn: (instanceId: string) => void = () => {};
  let onAfterDespawn: (instanceId: string) => void = () => {};

  function spawnEntity(name: string, spawnOptions?: SpawnOptions): string {
    const entry = content.entityById?.(name);
    const walkSpeed = spawnOptions?.movement?.walkSpeed ?? entry?.movement?.walkSpeed;
    const options =
      walkSpeed === undefined
        ? spawnOptions
        : { ...spawnOptions, movement: { ...spawnOptions?.movement, walkSpeed } };
    const instanceId = entities.spawn(name, options);
    onAfterSpawn(instanceId);
    statsByInstance.set(instanceId, entry?.stats === undefined ? {} : seedStatValues(entry.stats));
    return instanceId;
  }

  function despawnEntity(instanceId: string): boolean {
    const existed = entities.despawn(instanceId);
    statsByInstance.delete(instanceId);
    targeting.clearAll(instanceId);
    entityColliders.delete(instanceId);
    onAfterDespawn(instanceId);
    return existed;
  }

  function moveEntityTowardCommit(
    instanceId: string,
    target: EntityPosition | string,
    options: MoveTowardCommitOptions,
  ): EntityPosition | null {
    const next = spatial.moveToward(instanceId, target, options);
    if (next === null) return null;
    const current = entities.get(instanceId);
    if (current === null) return null;
    let rotationY = current.rotationY;
    if (options.face === true) {
      const dx = next[0] - current.position[0];
      const dz = next[2] - current.position[2];
      if (Math.hypot(dx, dz) > 1e-9) rotationY = Math.atan2(dx, dz);
    }
    entities.setPose(instanceId, { position: next, rotationY });
    return next;
  }

  function resetAllToSpawn(filter?: (entity: SceneEntity) => boolean): number {
    let count = 0;
    for (const entity of entities.list()) {
      if (filter !== undefined && !filter(entity)) continue;
      if (entities.resetToSpawn(entity.id)) count += 1;
    }
    return count;
  }

  const bodyBinds = new Map<string, BodyBind>();
  function bind(key: string): BodyBind {
    const existing = bodyBinds.get(key);
    if (existing !== undefined) return existing;
    const created = createBodyBind({
      has: (id) => entities.get(id) !== null,
      spawn: spawnEntity,
      despawn: despawnEntity,
      setPose: entities.setPose,
      update: entities.update,
    });
    bodyBinds.set(key, created);
    return created;
  }

  const objectSelection = notifyAfter(
    createSelectionSet(),
    ["add", "remove", "toggle", "replace", "clear"],
    signalNotify,
  );

  const sceneObjects: SceneObjectContext = {
    ...objects,
    remove(instanceId) {
      const existed = objects.remove(instanceId);
      if (existed) objectSelection.remove(instanceId);
      return existed;
    },
    catalog: (instanceId) => catalogObject(instanceId) ?? null,
    raycast: (input) => raycastObjects(objects, input),
    raycastAll: (input) => raycastObjectsAll(objects, input),
    setColliders(instanceId, colliders) {
      if (colliders === null) objectColliders.delete(instanceId);
      else objectColliders.set(instanceId, colliders);
      signalNotify();
    },
    collidersOf: objectCollidersOf,
    reportBounds: reportObjectBounds,
    reportCollisionMesh: reportObjectCollisionMesh,
    selection: objectSelection,
  };

  return {
    entities,
    objects,
    statsByInstance,
    entityStats,
    ensureInstanceStats,
    catalogEntry,
    catalogObject,
    spatial,
    combatSpatial,
    sceneRaycast,
    targeting,
    entityColliders,
    objectColliders,
    entityCollidersOf,
    objectCollidersOf,
    reportEntityBounds,
    reportEntityCollisionMesh,
    entityVisualScaleOf,
    forms,
    paintLayer,
    spawnEntity,
    despawnEntity,
    moveEntityTowardCommit,
    resetAllToSpawn,
    bind,
    sceneObjects,
    setOnAfterSpawn(fn) {
      onAfterSpawn = fn;
    },
    setOnAfterDespawn(fn) {
      onAfterDespawn = fn;
    },
  };
}
