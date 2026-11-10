/** @jsxImportSource @jgengine/core/ui/jsx */
// @skill jgengine-world
import { memo, useCallback, useEffect, useRef, useState, Fragment, type ReactNode } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import { objectVisualScale, type SceneObject } from "@jgengine/core/scene/objectStore";
import { createModelVariantSelector } from "@jgengine/core/lod/modelLod";
import { devtools } from "@jgengine/core/devtools/devtools";
import { sceneProbeReading } from "@jgengine/core/devtools/discover";
import { reportFallbackSeam } from "@jgengine/core/devtools/fallbackSeams";
import { useGameContext } from "@jgengine/ui/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { preloadSceneModel } from "@jgengine/core/model/entityModelDraw.draw";
import { loadOverrideMapSets, type OverrideMapSetsLease } from "@jgengine/core/material/materialAsset.draw";
import { variantLevelModel } from "@jgengine/core/lod/singleVariantLod.draw";
import { assignVariantLevels, createLevelPassGate, levelPassProbe, noteLevelPass, noteLevelPassFrame, variantSwitchOf } from "@jgengine/core/lod/levelPass.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { measureLocalBounds, reportMeasuredBounds } from "@jgengine/core/model/measureBounds.draw";
import { recordRenderBounds } from "@jgengine/core/visibility/measuredBounds";
import { measureLocalCollisionTriangles, reportMeasuredCollisionMesh } from "@jgengine/core/model/measureCollisionMesh.draw";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "@jgengine/core/scatter/scatterModels.draw";
import { useRenderVisibility, useVisibilityChangesSource } from "@jgengine/core/visibility/CullingProvider.draw";
import type { VisibilityChanges } from "@jgengine/core/visibility/visibilityChanges";
import { acquireImpostor, createImpostorMaterials, IMPOSTOR_MIN_RADIUS, impostorCard, impostorDistance, impostorSettingsForQuality, impostorSwitch, releaseImpostor, sourceRadius, type ImpostorAtlas, type ImpostorEntry, type ImpostorSettings, type ImpostorSource } from "@jgengine/core/lod/impostor.draw";
import { acquireImpostorCardPool, ImpostorCardPool, releaseImpostorCardPool, type ImpostorCardSlice } from "@jgengine/core/lod/impostorCardPool.draw";
import { terrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { warmupWaitsFor } from "@jgengine/core/render/shaderWarmup.draw";
import { joinFrameTask } from "@jgengine/core/frame/frameBoard.draw";
import { childFrameState, type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { staticDrawPoolFor, type ProxyRole, type StaticDrawSlot } from "./staticDrawPool.draw";
import { builtLevelSource, cameraFov, currentMeshLodGame, loadBakedImpostor, reskinBuiltLevel, resolveBuiltLodModel, type BuiltLodModel } from "@jgengine/core/lod/builtLods.draw";
import { IMPOSTOR_LEVEL_URL, type BuiltLodMeta } from "@jgengine/core/lod/builtLods";
import type { HlodConfig } from "@jgengine/core/visibility/config";
import { blendsSource, canInstanceStaticScene, countStaticBatchDraws, staticBatchCell, gatherStaticMembers, harvestStaticPieces, incompatibleStaticObjectIds, isCompatibleStaticObject, sortFarToNear, STATIC_BATCH_MESH_KEY, staticModelPieces, syncStaticObjectSource, type StaticObjectBatch } from "./staticObjectBatches.draw";

/**
 * Report what static object batching is doing to `debug_snapshot().systems`: the grouped batches, the
 * total instances behind them, and how many instances survived per-instance culling this frame. A
 * batch whose instances are all outside the view contributes a draw of zero, so `drawn` is the culling
 * evidence, not a claim.
 * @internal
 */
export function useStaticObjectBatchProbe(
  scene: THREE.Object3D,
  stats: { batches: number; instances: number; singles: number },
): void {
  const ref = useRef(stats);
  ref.current = stats;
  useEffect(() => {
    const drawCounts = sceneProbeReading(() => countStaticBatchDraws(scene));
    return devtools.probes.registerSystem("render/staticBatches", {
      counters: () => ({ ...ref.current, ...drawCounts() }),
      state: () => {
        const { draws, drawn } = drawCounts();
        return `${ref.current.batches} batches · ${draws} draws · ${drawn}/${ref.current.instances} instances drawn`;
      },
    });
  }, [scene]);
  useEffect(() => devtools.probes.registerSystem("render/levelPass", levelPassProbe()), []);
}

/**
 * Which detail level each placement draws at. `revision` moves on every change, so a level's members
 * are gathered again only after the switch moved one of them.
 * @internal
 */
export class LevelAssignment extends Map<string, number> {
  revision = 0;

  override set(id: string, level: number): this {
    if (super.get(id) !== level) this.revision += 1;
    return super.set(id, level);
  }

  override delete(id: string): boolean {
    const had = super.delete(id);
    if (had) this.revision += 1;
    return had;
  }

  override clear(): void {
    if (this.size > 0) this.revision += 1;
    super.clear();
  }
}

/** One source's per-frame write, held by reference so a re-render swaps it in place. @internal */
export interface SourceStep {
  run(): void;
}

/**
 * The write steps of one batch's sources. `run` calls every step after the placed objects or the
 * gathered members changed, and otherwise only the steps marked since the last run, so a still batch
 * costs one compare a frame however many sources it has.
 * @internal
 */
export class SourceSteps {
  readonly all = new Set<SourceStep>();
  readonly pending = new Set<SourceStep>();
  private objects = -1;
  private members = -1;

  add(step: SourceStep): void {
    this.all.add(step);
    this.pending.add(step);
  }

  delete(step: SourceStep): void {
    this.all.delete(step);
    this.pending.delete(step);
  }

  /** Run the steps due, given the object store's version and the members' gather count. */
  run(objects: number, members: number): void {
    if (this.objects !== objects || this.members !== members) {
      this.objects = objects;
      this.members = members;
      this.pending.clear();
      for (const step of this.all) step.run();
      return;
    }
    if (this.pending.size === 0) return;
    for (const step of this.pending) step.run();
    this.pending.clear();
  }
}

/**
 * Join `run` to the sources `members` drives. It runs on the frame after any render of its owner and
 * after the batch's members or a placed object changed; on any other frame it is not called at all.
 * A world of a thousand still props paid a callback per source per frame only to find nothing new.
 *//** A flag that `mark` raises and `take` answers and lowers; raised at first. */
function createChangeFlag(): { take(): boolean; mark(): void } {
  let dirty = true;
  return { mark: () => { dirty = true; }, take: () => { const was = dirty; dirty = false; return was; } };
}

/** Draw-side `useObjectChanges`: the same dirty flag, fed by the object store's change subscription. */
function watchObjectChanges(ctx: GameContext): { take(): boolean; dispose(): void } {
  const flag = createChangeFlag();
  const off = ctx.scene.object.subscribe(flag.mark);
  return { take: flag.take, dispose: off };
}

/**
 * Draw-side `useMemberVisibilityChanges`: answers and resets whether one of the watched objects
 * entered or left the render-visible set, re-watching when the object list identity changes.
 */
class MemberVisibilityWatch {
  private readonly flag = createChangeFlag();
  private objects: readonly SceneObject[] | null = null;
  private unwatch: (() => void) | null = null;
  constructor(private readonly changes: VisibilityChanges) {}
  sync(objects: readonly SceneObject[]): void {
    if (objects === this.objects) return;
    this.objects = objects;
    this.flag.mark();
    this.unwatch?.();
    this.unwatch = this.changes.watch(objects.map((object) => object.instanceId), this.flag.mark);
  }
  take(): boolean {
    return this.flag.take();
  }
  dispose(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.objects = null;
  }
}

/** Everything a static-batch draw reads live: context, the render-visibility feed and the singles sink. */
interface StaticBatchEnv {
  readonly ctx: GameContext;
  visibility(): (id: string) => boolean;
  readonly changes: VisibilityChanges;
  readonly singles: StaticSingles;
}

/**
 * The members one batch (or one detail level of it) draws this frame, gathered once before its
 * sources write their instances. `level` narrows them to the placements `assignment` put on it.
 * Gathered again only when an object, the visible set or these inputs changed; `version` counts the
 * gathers, so a source rewrites its instances only after one.
 */
class StaticMembersDriver {
  readonly current: SceneObject[] = [];
  version = 0;
  readonly steps = new SourceSteps();
  private readonly changed: ReturnType<typeof watchObjectChanges>;
  private readonly shown: MemberVisibilityWatch;
  private gathered: { objects: unknown; assignment: unknown; revision: number; level: unknown } = { objects: null, assignment: null, revision: -1, level: null };
  private leaveGather: (() => void) | null = null;
  private leaveSteps: (() => void) | null = null;

  constructor(
    private readonly env: StaticBatchEnv,
    private readonly batch: StaticObjectBatch,
    private readonly objects: () => readonly SceneObject[],
    private readonly assignment: LevelAssignment | undefined,
    private readonly level: number | undefined,
    private readonly drawn: () => boolean,
  ) {
    this.changed = watchObjectChanges(env.ctx);
    this.shown = new MemberVisibilityWatch(env.changes);
  }

  mount(): void {
    this.leaveGather = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.15, () => this.gather());
    this.leaveSteps = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.2, () => this.runSteps());
  }

  /** A source re-registers pending after any owner update, like the old layout-effect mark. */
  poke(): void {
    for (const step of this.steps.all) this.steps.pending.add(step);
  }

  private gather(): void {
    if (!this.drawn()) return;
    const objects = this.objects();
    this.shown.sync(objects);
    const last = this.gathered;
    const objectsChanged = this.changed.take();
    const visibilityChanged = this.shown.take();
    const revision = this.assignment?.revision ?? 0;
    if (!objectsChanged && !visibilityChanged && last.objects === objects && last.assignment === this.assignment && last.revision === revision && last.level === this.level) return;
    this.gathered = { objects, assignment: this.assignment, revision, level: this.level };
    this.version += 1;
    const assignment = this.assignment;
    const level = this.level;
    const accept = assignment !== undefined && level !== undefined
      ? (live: SceneObject) => assignment.get(live.instanceId) === level
      : undefined;
    const ctx = this.env.ctx;
    const model = this.batch.model;
    const catalogId = this.batch.objects[0]?.catalogId;
    gatherStaticMembers(objects, (id) => {
      const object = ctx.scene.object.get(id);
      return object !== null && object.catalogId === catalogId && isCompatibleStaticObject(object, model, ctx.scene.object.catalog(id)) ? object : null;
    }, this.env.visibility(), accept, this.current);
  }

  private runSteps(): void {
    if (!this.drawn()) return;
    this.steps.run(this.env.ctx.scene.object.version(), this.version);
  }

  dispose(): void {
    this.leaveGather?.();
    this.leaveSteps?.();
    this.changed.dispose();
    this.shown.dispose();
  }
}

/**
 * Live members of one batch after the per-frame compatibility gate removed any that changed at
 * runtime â€” the draw-side `useBatchMembers`.
 */
class BatchMembership {
  objects: readonly SceneObject[];
  private excluded: readonly string[] = [];
  private readonly changed: ReturnType<typeof watchObjectChanges>;
  private readonly fallbackObjects = new Map<string, SceneObject>();
  private leave: (() => void) | null = null;

  constructor(private readonly env: StaticBatchEnv, private readonly batch: StaticObjectBatch) {
    this.changed = watchObjectChanges(env.ctx);
    this.objects = batch.objects;
  }

  mount(): void {
    this.leave = joinFrameTask(0, () => this.sync());
  }

  private sync(): void {
    if (!this.changed.take()) return;
    const next = incompatibleStaticObjectIds(this.batch, this.env.ctx.scene.object.get, this.env.ctx.scene.object.catalog, this.excluded, this.fallbackObjects);
    if (next === this.excluded) return;
    this.excluded = next;
    this.objects = this.batch.objects.filter((object) => !next.includes(object.instanceId));
    this.env.singles.clearPrefix("excluded:");
    for (const id of next) {
      const live = this.env.ctx.scene.object.get(id);
      if (live !== null) this.env.singles.set(`excluded:${id}`, live);
    }
  }

  dispose(): void {
    this.leave?.();
    this.changed.dispose();
  }
}

/**
 * The objects one batch still draws through the individual renderer, aggregated across its levels
 * and its fallbacks. Contributors key their entries; the batch flushes the union to React.
 */
class StaticSingles {
  private readonly entries = new Map<string, SceneObject>();
  private dirty = false;
  constructor(private readonly report: (objects: readonly SceneObject[]) => void) {}
  set(key: string, object: SceneObject): void {
    if (this.entries.get(key) === object) return;
    this.entries.set(key, object);
    this.dirty = true;
  }
  clearPrefix(prefix: string): void {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        this.dirty = true;
      }
    }
  }
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.report([...this.entries.values()]);
  }
}

/** An inner {@link EngineDraw} mounted under a parent group: fresh child frame state per call, board-joined frame. */
class MountedDraw {
  private leave: (() => void) | null = null;
  constructor(private readonly draw: EngineDraw, private readonly parent: THREE.Object3D) {}
  mount(state: EngineFrameState): void {
    const parent = this.parent;
    this.draw.mount?.(childFrameState(state, parent));
    this.leave = joinFrameTask(this.draw.priority ?? 0, (s, delta) => this.draw.frame?.(childFrameState(s, parent), delta));
  }
  update(state: EngineFrameState): void {
    this.draw.update?.(childFrameState(state, this.parent));
  }
  dispose(state: EngineFrameState): void {
    this.leave?.();
    this.leave = null;
    this.draw.dispose?.(childFrameState(state, this.parent));
  }
}

/** What a pooled source last placed: its slot, its objects, and each one's record as it was. @internal */
export interface SourcePlacement<Slot> {
  slot: Slot;
  objects: readonly SceneObject[];
  records: readonly (SceneObject | null)[];
}

/**
 * Whether a pooled source must place its instances again: a new slot or object list, or a record of
 * one of its own objects replaced. The store replaces a record when its object moves, turns or leaves,
 * so a world change that touched none of this source's objects costs it a compare, not a re-place.
 * @internal
 */
export function placementStale<Slot>(last: SourcePlacement<Slot> | null, slot: Slot, objects: readonly SceneObject[], get: (instanceId: string) => SceneObject | null): boolean {
  return last === null || last.slot !== slot || last.objects !== objects || objects.some((object, index) => get(object.instanceId) !== last.records[index]);
}

/** A source whose material a pool batch shares: its placements are instances of that batch. */
function pooledSourceDraw(env: StaticBatchEnv, args: {
  slot: StaticDrawSlot;
  source: ScatterModelSource;
  members: StaticMembersDriver;
  objects: () => readonly SceneObject[];
}): EngineDraw {
  const { slot, source, members } = args;
  const indexOf = new Map<string, number>();
  const scratch = new THREE.Object3D();
  let placed: SourcePlacement<StaticDrawSlot> | null = null;
  let checkedVersion = -1;
  let syncedAt: { slot: StaticDrawSlot; members: number; placed: unknown; slotOf: unknown } | null = null;
  let indexed: readonly SceneObject[] | null = null;
  const live: SceneObject[] = [];
  const syncIndex = (objects: readonly SceneObject[]) => {
    indexOf.clear();
    objects.forEach((object, index) => indexOf.set(object.instanceId, index));
    indexed = objects;
  };
  const slotOf = (object: SceneObject) => indexOf.get(object.instanceId);
  const matrixOf = (object: SceneObject, out: THREE.Matrix4) => {
    scratch.position.fromArray(object.position);
    scratch.rotation.set(0, object.rotationY, 0);
    scratch.scale.fromArray(objectVisualScale(object.visual));
    scratch.updateMatrix();
    return out.multiplyMatrices(scratch.matrix, source.localMatrix);
  };
  const step: SourceStep = {
    run: () => {
      const objects = args.objects();
      if (indexed !== objects) syncIndex(objects);
      const version = env.ctx.scene.object.version();
      const last = placed;
      if (last === null || last.slot !== slot || last.objects !== objects || checkedVersion !== version) {
        checkedVersion = version;
        if (placementStale(last, slot, objects, env.ctx.scene.object.get)) {
          const records = objects.map((object) => env.ctx.scene.object.get(object.instanceId));
          live.length = 0;
          for (const record of records) if (record !== null) live.push(record);
          placed = { slot, objects, records };
          slot.place(live, slotOf, matrixOf);
        }
      }
      // The shown instances follow the members alone: written again only after they were gathered again.
      const synced = syncedAt;
      if (synced?.slot === slot && synced.members === members.version && synced.placed === placed && synced.slotOf === slotOf) return;
      syncedAt = { slot, members: members.version, placed, slotOf };
      slot.sync(members.current, slotOf, matrixOf);
    },
  };
  return {
    mount() {
      members.steps.add(step);
      syncIndex(args.objects());
    },
    update() {
      members.steps.pending.add(step);
    },
    dispose() {
      members.steps.delete(step);
    },
  };
}

/** A source drawn on its own: one instanced draw holding this batch's placements. */
function instancedSourceDraw(args: {
  source: ScatterModelSource;
  members: StaticMembersDriver;
  capacity: () => number;
}): EngineDraw {
  const { source, members } = args;
  const blends = blendsSource(source);
  const scratch = new THREE.Object3D();
  const eye = new THREE.Vector3();
  const ordered: SceneObject[] = [];
  let mesh: THREE.InstancedMesh | null = null;
  let parent: THREE.Object3D | null = null;
  let capacity = -1;
  const syncedAt = { mesh: null as THREE.InstancedMesh | null, members: -1 };
  const ensureMesh = () => {
    const want = Math.max(0, args.capacity());
    if (mesh !== null && want === capacity) return mesh;
    if (mesh !== null) {
      parent?.remove(mesh);
      mesh.dispose();
    }
    mesh = new THREE.InstancedMesh(source.geometry, source.material, want);
    mesh.name = "staticobj";
    mesh.userData[STATIC_BATCH_MESH_KEY] = true;
    mesh.castShadow = source.castShadow ?? false;
    mesh.receiveShadow = source.receiveShadow ?? false;
    freezeStaticTransforms(mesh);
    parent?.add(mesh);
    capacity = want;
    syncedAt.mesh = null;
    return mesh;
  };
  // An opaque source's instances follow the members alone, so the batch runs it after a gather; a
  // see-through one re-sorts as the camera moves, so it writes every frame on its own.
  const step: SourceStep = {
    run: () => {
      const current = mesh;
      if (blends || current === null) return;
      if (syncedAt.mesh === current && syncedAt.members === members.version) return;
      syncedAt.mesh = current;
      syncedAt.members = members.version;
      syncStaticObjectSource(current, source, members.current, scratch);
    },
  };
  let leaveFrame: (() => void) | null = null;
  return {
    mount(state: EngineFrameState) {
      parent = state.scene;
      ensureMesh();
      members.steps.add(step);
      if (blends) {
        leaveFrame = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.2, (frameState) => {
          const current = mesh;
          if (current === null) return;
          frameState.camera.getWorldPosition(eye);
          syncStaticObjectSource(current, source, sortFarToNear(members.current, eye, ordered), scratch);
        });
      }
    },
    update() {
      ensureMesh();
      members.steps.pending.add(step);
    },
    dispose(_state: EngineFrameState) {
      leaveFrame?.();
      members.steps.delete(step);
      const current = mesh;
      mesh = null;
      capacity = -1;
      if (current !== null) {
        parent?.remove(current);
        current.dispose();
      }
      parent = null;
    },
  };
}

/** One source of a batch: its pool slot when the cell has one, its own instanced draw otherwise. */
function objectSourceDraw(env: StaticBatchEnv, args: {
  source: ScatterModelSource;
  members: StaticMembersDriver;
  objects: () => readonly SceneObject[];
  proxy?: ProxyRole | undefined;
}): EngineDraw {
  const group = new THREE.Group();
  let inner: MountedDraw | null = null;
  let slot: StaticDrawSlot | null = null;
  let scene: THREE.Scene | null = null;
  let lastKey = "";
  let stateRef: EngineFrameState | null = null;

  const rebuild = () => {
    if (scene === null || stateRef === null) return;
    const objects = args.objects();
    const cell = staticBatchCell(objects);
    const capacity = objects.length;
    const proxy = args.proxy ?? "part";
    const key = `${cell}${capacity}${proxy}`;
    if (key === lastKey) return;
    lastKey = key;
    inner?.dispose(stateRef);
    inner = null;
    slot?.release();
    slot = null;
    const acquired = staticDrawPoolFor(scene).acquire(args.source, cell, capacity, proxy);
    slot = acquired;
    const draw = acquired === null
      ? instancedSourceDraw({ source: args.source, members: args.members, capacity: () => args.objects().length })
      : pooledSourceDraw(env, { slot: acquired, source: args.source, members: args.members, objects: args.objects });
    inner = new MountedDraw(draw, group);
    inner.mount(stateRef);
  };

  return {
    mount(state: EngineFrameState) {
      scene = state.rootScene ?? state.scene;
      stateRef = state;
      state.scene.add(group);
      rebuild();
      args.members.poke();
    },
    update(state: EngineFrameState) {
      stateRef = state;
      rebuild();
      inner?.update(state);
      args.members.poke();
    },
    dispose(state: EngineFrameState) {
      inner?.dispose(state);
      inner = null;
      slot?.release();
      slot = null;
      scene = null;
      stateRef = null;
      lastKey = "";
      state.scene.remove(group);
    },
  };
}

/**
 * One instanced draw of impostor cards for the placements `assignment` put on `level`, sharing its
 * card pool with every batch of the same atlas. Placements in the visibility pass's culled set draw none.
 */
function impostorCardsDraw(env: StaticBatchEnv, args: {
  poolKey: string;
  atlas: ImpostorAtlas;
  materials: { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial };
  objects: () => readonly SceneObject[];
  assignment: LevelAssignment;
  level: number;
  onCardsMounted?: (() => void) | undefined;
}): EngineDraw {
  const { atlas, materials, assignment, level } = args;
  const changed = watchObjectChanges(env.ctx);
  const shown = new MemberVisibilityWatch(env.changes);
  let pool: ImpostorCardPool | null = null;
  let slice: ImpostorCardSlice | null = null;
  let sliceCapacity = -1;
  let scene: THREE.Scene | null = null;
  const written = { card: null as unknown, revision: -1, objects: null as unknown, level: -1 };
  let leaveWrite: (() => void) | null = null;
  let leavePack: (() => void) | null = null;

  const acquireSlice = () => {
    if (pool === null || scene === null) return;
    const want = args.objects().length;
    if (want === sliceCapacity) return;
    if (slice !== null) pool.drop(slice);
    slice = pool.slice(want);
    sliceCapacity = want;
    written.card = null;
  };

  return {
    mount(state: EngineFrameState) {
      scene = state.rootScene ?? state.scene;
      pool = acquireImpostorCardPool(args.poolKey, scene, materials.material, () => new ImpostorCardPool(impostorCard(atlas), materials.material, materials.depth));
      acquireSlice();
      args.onCardsMounted?.();
      leaveWrite = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.2, () => {
        acquireSlice();
        if (pool === null || slice === null) return;
        const objects = args.objects();
        shown.sync(objects);
        // The cards follow their placements, the visible set and the level switch alone: rewritten only after one moved.
        const objectsChanged = changed.take();
        const visibilityChanged = shown.take();
        if (!objectsChanged && !visibilityChanged && written.card === slice && written.revision === assignment.revision &&
          written.objects === objects && written.level === level) return;
        written.card = slice;
        written.revision = assignment.revision;
        written.objects = objects;
        written.level = level;
        let count = 0;
        for (const object of objects) {
          if (assignment.get(object.instanceId) !== level) continue;
          const live = env.ctx.scene.object.get(object.instanceId);
          if (live === null || !env.visibility()(live.instanceId)) continue;
          cardPose.position.fromArray(live.position);
          cardPose.rotation.set(0, live.rotationY, 0);
          cardPose.scale.fromArray(objectVisualScale(live.visual));
          cardPose.updateMatrix();
          slice.matrices.set(cardPose.matrix.elements, count * 16);
          slice.ids[count] = live.instanceId;
          count += 1;
        }
        slice.count = count;
        slice.ids.length = count;
        slice.version += 1;
      });
      leavePack = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.3, (frameState) => {
        pool?.pack(frameState.clock.elapsedTime);
      });
    },
    update() {
      acquireSlice();
    },
    dispose() {
      leaveWrite?.();
      leavePack?.();
      if (pool !== null && slice !== null) pool.drop(slice);
      if (pool !== null) releaseImpostorCardPool(args.poolKey, pool);
      pool = null;
      slice = null;
      sliceCapacity = -1;
      scene = null;
      changed.dispose();
      shown.dispose();
    },
  };
}

const probe = new THREE.Vector3();
const cardPose = new THREE.Object3D();

/** The shared impostor entry a batch's far placements draw through, acquired and released with the draw. */
class ImpostorEntryDriver {
  entry: ImpostorEntry | null = null;
  cardsMounted = false;
  private resolveLanded: (() => void) | null = null;
  private leaveCheck: (() => void) | null = null;
  constructor(
    private readonly key: string,
    private readonly sources: readonly ImpostorSource[],
    private readonly settings: ImpostorSettings,
    private readonly gl: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
  ) {}
  mount(): void {
    const acquired = acquireImpostor(this.key, this.gl, this.sources, this.settings);
    if (acquired.baked) this.entry = acquired;
    else {
      warmupWaitsFor(this.scene, new Promise<void>((resolve) => { this.resolveLanded = resolve; }), `impostor cards ${this.key}`);
      void acquired.ready.then(() => {
        this.entry = acquired;
        // Nothing to draw: there are no cards to wait for.
        if (acquired.atlas === null) {
          this.resolveLanded?.();
          this.resolveLanded = null;
        }
      });
    }
    this.leaveCheck = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.25, () => {
      if (this.entry?.baked === true && this.cardsMounted && this.resolveLanded !== null) {
        this.resolveLanded();
        this.resolveLanded = null;
      }
    });
  }
  dispose(): void {
    this.leaveCheck?.();
    this.resolveLanded?.();
    releaseImpostor(this.key, this.gl, this.settings);
  }
}

/**
 * A batch of a model big enough to read from afar: near placements draw the real model, far ones
 * one impostor card each in a single instanced draw. The split reruns when the camera moves or a
 * placement does.
 */
function impostorStaticDraw(env: StaticBatchEnv, args: {
  batch: StaticObjectBatch;
  model: ModelConfig;
  objects: () => readonly SceneObject[];
  sources: readonly ScatterModelSource[];
  radius: number;
}): EngineDraw {
  const { batch, model, sources, radius } = args;
  const group = new THREE.Group();
  const children = new Map<string, MountedDraw>();
  const assignment = new LevelAssignment();
  const camera = new THREE.Vector3();
  const quality = { current: terrainQuality() };
  let settings = impostorSettingsForQuality(quality.current);
  const key = `object:${model.url}:${JSON.stringify(model)}`;
  let entryDriver: ImpostorEntryDriver | null = null;
  let members: StaticMembersDriver | null = null;
  let leaveAssign: (() => void) | null = null;
  let last: { at: THREE.Vector3; version: number; ready: boolean; objects: readonly SceneObject[] } | null = null;
  let stateRef: EngineFrameState | null = null;

  const dropCards = (state: EngineFrameState) => {
    const cards = children.get("cards");
    cards?.dispose(state);
    children.delete("cards");
    if (entryDriver !== null) entryDriver.cardsMounted = false;
  };

  const syncEntry = (state: EngineFrameState) => {
    const nextQuality = terrainQuality();
    if (nextQuality !== quality.current) {
      quality.current = nextQuality;
      settings = impostorSettingsForQuality(quality.current);
      entryDriver?.dispose();
      entryDriver = null;
      dropCards(state);
    }
    // The bake only runs while the batch has placements to put cards on, like the old conditional mount.
    const wants = args.objects().length > 0;
    if (!wants && entryDriver !== null) {
      entryDriver.dispose();
      entryDriver = null;
      dropCards(state);
    }
    if (entryDriver === null && wants && stateRef !== null) {
      entryDriver = new ImpostorEntryDriver(key, sources, settings, stateRef.gl, stateRef.rootScene ?? stateRef.scene);
      entryDriver.mount();
    }
    const entry = entryDriver?.entry ?? null;
    if (wants && entry?.atlas != null && entry.materials !== null && !children.has("cards")) {
      const materials = entry.materials;
      const draw = impostorCardsDraw(env, {
        poolKey: `${key}:${settings.frames}x${settings.cell}`,
        atlas: entry.atlas,
        materials,
        objects: args.objects,
        assignment,
        level: 1,
        onCardsMounted: () => { if (entryDriver !== null) entryDriver.cardsMounted = true; },
      });
      const mounted = new MountedDraw(draw, group);
      mounted.mount(state);
      children.set("cards", mounted);
    }
  };

  return {
    mount(state: EngineFrameState) {
      stateRef = state;
      state.scene.add(group);
      members = new StaticMembersDriver(env, batch, args.objects, assignment, 0, () => true);
      members.mount();
      for (const [index, source] of sources.entries()) {
        const draw = objectSourceDraw(env, { source, members, objects: args.objects, proxy: "own" });
        const mounted = new MountedDraw(draw, group);
        mounted.mount(state);
        children.set(`source:${index}`, mounted);
      }
      syncEntry(state);
      leaveAssign = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.1, (frameState) => {
        frameState.camera.getWorldPosition(camera);
        const version = env.ctx.scene.object.version();
        const objects = args.objects();
        const previous = last;
        const entry = entryDriver?.entry ?? null;
        const ready = entry?.atlas != null && entry.materials !== null;
        if (previous !== null && previous.ready === ready && previous.objects === objects && previous.version === version &&
          previous.at.distanceToSquared(camera) < IMPOSTOR_SPLIT_MOVE * IMPOSTOR_SPLIT_MOVE) return;
        for (const object of objects) {
          const live = env.ctx.scene.object.get(object.instanceId);
          if (live === null) continue;
          const scale = Math.max(...objectVisualScale(live.visual));
          const distance = camera.distanceTo(probe.fromArray(live.position));
          const far = ready && impostorSwitch(distance, impostorDistance(radius * scale, quality.current), assignment.get(live.instanceId) === 1);
          assignment.set(live.instanceId, far ? 1 : 0);
        }
        last = { at: (previous?.at ?? new THREE.Vector3()).copy(camera), version, ready, objects };
      });
    },
    update(state: EngineFrameState) {
      stateRef = state;
      syncEntry(state);
      for (const child of children.values()) child.update(state);
      members?.poke();
    },
    frame(state: EngineFrameState) {
      syncEntry(state);
    },
    dispose(state: EngineFrameState) {
      leaveAssign?.();
      entryDriver?.dispose();
      entryDriver = null;
      for (const child of children.values()) child.dispose(state);
      children.clear();
      members?.dispose();
      members = null;
      stateRef = null;
      state.scene.remove(group);
    },
  };
}

/** Bounds and collision triangles of one harvested model, measured once however often its batch re-renders. */
const sourceMeasures = new WeakMap<object, { bounds: ReturnType<typeof measureLocalBounds>; triangles: ReturnType<typeof measureLocalCollisionTriangles> }>();

function reportSourceMeasures(ctx: GameContext, harvested: { sources: readonly ScatterModelSource[] }, batch: StaticObjectBatch): void {
  let measured = sourceMeasures.get(harvested);
  if (measured === undefined) {
    const root = new THREE.Group();
    for (const source of harvested.sources) {
      const mesh = new THREE.Mesh(source.geometry, source.material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(source.localMatrix);
      root.add(mesh);
    }
    measured = { bounds: measureLocalBounds(root), triangles: measureLocalCollisionTriangles(root) };
    sourceMeasures.set(harvested, measured);
  }
  const key = batch.objects[0]?.catalogId;
  if (key === undefined) return;
  if (measured.bounds !== null) {
    recordRenderBounds(ctx, "object", key, measured.bounds);
    // Index dims keep priority for colliders; culling always uses what was really mounted.
    if (batch.model.dims?.maxY === undefined) reportMeasuredBounds(ctx, "object", key, measured.bounds);
  }
  if (measured.triangles !== null) reportMeasuredCollisionMesh(ctx, "object", key, measured.triangles);
}

const IMPOSTOR_SPLIT_MOVE = 1;

interface HarvestedBatch {
  readonly sources: readonly ScatterModelSource[];
  readonly roots: readonly THREE.Object3D[];
  readonly lease: OverrideMapSetsLease;
}

/**
 * One detail level's GLB, harvested into instanced draws that only claim the instances the selector
 * put on this level â€” the draw-side `VariantLevel`.
 */
function variantLevelDraw(env: StaticBatchEnv, args: {
  url: string;
  model: ModelConfig;
  batch: StaticObjectBatch;
  objects: () => readonly SceneObject[];
  level: number;
  assignment: LevelAssignment;
  measure: boolean;
  proxy: ProxyRole;
  singlesPrefix: string;
}): EngineDraw {
  const group = new THREE.Group();
  const children = new Map<string, MountedDraw>();
  let cancelled = false;
  let stateRef: EngineFrameState | null = null;
  let members: StaticMembersDriver | null = null;
  let harvested: { sources: ScatterModelSource[]; root: THREE.Object3D } | null = null;
  let lease: OverrideMapSetsLease | null = null;

  const reportLevelSingles = () => {
    env.singles.clearPrefix(args.singlesPrefix);
    for (const object of args.objects()) {
      if (args.assignment.get(object.instanceId) !== args.level) continue;
      const live = env.ctx.scene.object.get(object.instanceId);
      if (live === null || !env.visibility()(live.instanceId)) continue;
      env.singles.set(`${args.singlesPrefix}${live.instanceId}`, live);
    }
  };

  let singlesChanged: ReturnType<typeof watchObjectChanges> | null = null;
  let singlesShown: MemberVisibilityWatch | null = null;
  let leaveSingles: (() => void) | null = null;
  let singlesGathered: { revision: number; objects: unknown; level: number } | null = null;

  const watchLevelSingles = () => {
    // Members of one level drawn through the individual renderer, for a level whose asset cannot
    // be instanced — gathered again only when an object, the visible set or the level switch moved.
    singlesChanged = watchObjectChanges(env.ctx);
    singlesShown = new MemberVisibilityWatch(env.changes);
    leaveSingles = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.2, () => {
      const objects = args.objects();
      singlesShown?.sync(objects);
      const objectsChanged = singlesChanged?.take() ?? false;
      const visibilityChanged = singlesShown?.take() ?? false;
      const last = singlesGathered;
      if (!objectsChanged && !visibilityChanged && last !== null && last.revision === args.assignment.revision &&
        last.objects === objects && last.level === args.level) return;
      singlesGathered = { revision: args.assignment.revision, objects, level: args.level };
      reportLevelSingles();
    });
  };

  const build = async () => {
    const built = builtLevelSource(args.url);
    const urls = built === null ? [args.url] : [args.url, built.source];
    const gltfs = await Promise.all(urls.map((url) => preloadSceneModel(url)));
    const [gltf, sourceGltf] = gltfs;
    if (cancelled || stateRef === null) return;
    if (gltf === undefined) return;
    const supported = canInstanceStaticScene(gltf.scene, gltf.animations);
    lease = await loadOverrideMapSets(stateRef.gl, [args.model]);
    if (cancelled || stateRef === null) {
      lease.dispose();
      return;
    }
    if (sourceGltf !== undefined) reskinBuiltLevel(gltf.scene, sourceGltf);
    harvested = supported ? buildScatterModelSources(gltf.scene, args.model, built?.bounds, lease.sets[0]) : null;
    if (harvested === null) {
      watchLevelSingles();
      return;
    }
    reportSourceMeasures(env.ctx, harvested, args.batch);
    const driver = new StaticMembersDriver(env, args.batch, args.objects, args.assignment, args.level, () => true);
    members = driver;
    driver.mount();
    for (const [index, part] of harvested.sources.entries()) {
      const draw = objectSourceDraw(env, { source: part, members: driver, objects: args.objects, proxy: args.proxy });
      const mounted = new MountedDraw(draw, group);
      mounted.mount(stateRef);
      children.set(`source:${index}`, mounted);
    }
    env.singles.clearPrefix(args.singlesPrefix);
  };

  return {
    mount(state: EngineFrameState) {
      stateRef = state;
      state.scene.add(group);
      void build().catch((error) => {
        reportFallbackSeam("object", "renderError");
        console.error("[jgengine:static-objects] level load failed", args.url, error);
      });
    },
    update(state: EngineFrameState) {
      stateRef = state;
      for (const child of children.values()) child.update(state);
      members?.poke();
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      for (const child of children.values()) child.dispose(state);
      children.clear();
      members?.dispose();
      members = null;
      leaveSingles?.();
      singlesChanged?.dispose();
      singlesShown?.dispose();
      if (harvested !== null) disposeScatterModelSources(harvested.root);
      harvested = null;
      lease?.dispose();
      lease = null;
      env.singles.clearPrefix(args.singlesPrefix);
      stateRef = null;
      state.scene.remove(group);
    },
  };
}

/** The impostor level of a built model: one card per placement the selector put past its impostor distance. */
function variantImpostorLevelDraw(env: StaticBatchEnv, args: {
  model: ModelConfig;
  meta: BuiltLodMeta;
  objects: () => readonly SceneObject[];
  assignment: LevelAssignment;
  level: number;
}): EngineDraw {
  const group = new THREE.Group();
  let cancelled = false;
  let stateRef: EngineFrameState | null = null;
  let inner: MountedDraw | null = null;
  let materials: { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } | null = null;
  const poolKey = `built:${args.model.url}:${JSON.stringify(args.model.targetHeight ?? null)}:${args.model.scale ?? 1}`;

  const build = async () => {
    const atlas = await loadBakedImpostor(args.model, args.meta);
    if (cancelled || atlas === null || stateRef === null) return;
    materials = createImpostorMaterials(atlas);
    const draw = impostorCardsDraw(env, {
      poolKey,
      atlas,
      materials,
      objects: args.objects,
      assignment: args.assignment,
      level: args.level,
    });
    inner = new MountedDraw(draw, group);
    inner.mount(stateRef);
  };

  return {
    mount(state: EngineFrameState) {
      stateRef = state;
      state.scene.add(group);
      void build().catch((error) => {
        reportFallbackSeam("object", "renderError");
        console.error("[jgengine:static-objects] impostor load failed", args.model.url, error);
      });
    },
    update(state: EngineFrameState) {
      stateRef = state;
      inner?.update(state);
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      inner?.dispose(state);
      inner = null;
      materials?.material.dispose();
      materials?.depth.dispose();
      materials = null;
      stateRef = null;
      state.scene.remove(group);
    },
  };
}

/**
 * A batch whose model declares detail levels: every level draws its own instanced meshes and claims
 * only the instances the shared distance switch put on it, so near and far trees of one species keep
 * their own mesh inside one batch cell â€” the draw-side `VariantStaticObjects`.
 */
function variantStaticDraw(env: StaticBatchEnv, args: {
  batch: StaticObjectBatch;
  objects: () => readonly SceneObject[];
  meta: BuiltLodMeta | null;
}): EngineDraw {
  const { batch, meta } = args;
  const group = new THREE.Group();
  const levels = batch.model.variants!.levels;
  const selector = createModelVariantSelector(batch.model.variants!);
  const variantSwitch = variantSwitchOf(batch.model.variants!);
  const gate = createLevelPassGate();
  const assignment = new LevelAssignment();
  const camera = new THREE.Vector3();
  const levelProbe = new THREE.Vector3();
  // One model per level for the batch's life: a fresh object each build rebuilt every level's
  // instanced sources and re-measured its collision triangles on every membership change.
  const levelModels = levels.map((_, index) => variantLevelModel(batch.model, index));
  const children = new Map<string, MountedDraw>();
  let members: readonly SceneObject[] = args.objects();
  let revision = -1;
  let activeSelector = selector;
  let leaveAssign: (() => void) | null = null;

  const impostor = levels[levels.length - 1]?.url === IMPOSTOR_LEVEL_URL;
  const coarsest = levels.length - (impostor ? 2 : 1);

  const buildLevels = (state: EngineFrameState) => {
    for (const [key, child] of children) {
      child.dispose(state);
      children.delete(key);
    }
    levels.forEach((level, index) => {
      const levelModel = levelModels[index];
      if (levelModel === undefined) return;
      if (level.url === IMPOSTOR_LEVEL_URL) {
        if (meta === null) return;
        const draw = variantImpostorLevelDraw(env, { model: batch.model, meta, objects: args.objects, assignment, level: index });
        const mounted = new MountedDraw(draw, group);
        mounted.mount(state);
        children.set(`level:${index}`, mounted);
        return;
      }
      const draw = variantLevelDraw(env, {
        url: level.url,
        model: levelModel,
        batch,
        objects: args.objects,
        level: index,
        assignment,
        measure: index === 0,
        proxy: impostor ? "own" : index === coarsest ? "part" : "hidden",
        singlesPrefix: `level:${index}:`,
      });
      const mounted = new MountedDraw(draw, group);
      mounted.mount(state);
      children.set(`level:${index}`, mounted);
    });
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      buildLevels(state);
      leaveAssign = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.1, (frameState) => {
        noteLevelPassFrame();
        frameState.camera.getWorldPosition(camera);
        const current = args.objects();
        const membership = members !== current;
        const model = activeSelector !== selector;
        const moved = revision !== env.ctx.scene.object.version();
        if (!membership && !model && !moved && !gate.needsPass(camera)) {
          noteLevelPass(false);
          return;
        }
        if (membership || model) assignment.clear();
        const margin = assignVariantLevels(selector, variantSwitch, current, env.ctx.scene.object.get, camera, assignment, levelProbe);
        gate.record(camera, margin);
        members = current;
        activeSelector = selector;
        revision = env.ctx.scene.object.version();
        noteLevelPass(true);
      });
    },
    update(state: EngineFrameState) {
      for (const child of children.values()) child.update(state);
    },
    dispose(state: EngineFrameState) {
      leaveAssign?.();
      for (const child of children.values()) child.dispose(state);
      children.clear();
      env.singles.clearPrefix("level:");
      state.scene.remove(group);
    },
  };
}

/**
 * A batch drawn with the model its built levels resolved to â€” the draw-side `LoadedStaticObjects`:
 * harvests the model's pieces into instanced draws, or impostor cards when it is big enough to read
 * from afar.
 */
function loadedStaticDraw(env: StaticBatchEnv, args: {
  batch: StaticObjectBatch;
  model: ModelConfig;
  membership: BatchMembership;
}): EngineDraw {
  const { batch, model, membership } = args;
  const group = new THREE.Group();
  const children = new Map<string, MountedDraw>();
  let cancelled = false;
  let stateRef: EngineFrameState | null = null;
  let harvested: HarvestedBatch | null = null;
  let members: StaticMembersDriver | null = null;
  let content: EngineDraw | null = null;
  let contentMounted: MountedDraw | null = null;

  const clearContent = (state: EngineFrameState) => {
    contentMounted?.dispose(state);
    contentMounted = null;
    content = null;
    for (const [key, child] of children) {
      child.dispose(state);
      children.delete(key);
    }
    members?.dispose();
    members = null;
    if (harvested !== null) {
      for (const root of harvested.roots) disposeScatterModelSources(root);
      harvested.lease.dispose();
      harvested = null;
    }
  };

  const build = async (state: EngineFrameState) => {
    const pieces = staticModelPieces(model);
    const gltfs = await Promise.all(pieces.map((piece) => preloadSceneModel(piece.model.url)));
    const pieceModels = pieces.map((piece) => piece.model);
    const lease = await loadOverrideMapSets(state.gl, pieceModels);
    if (cancelled || stateRef === null) {
      lease.dispose();
      return;
    }
    let result: { sources: ScatterModelSource[]; roots: THREE.Object3D[] } | null = null;
    try {
      result = harvestStaticPieces(pieces, gltfs, lease.sets);
    } catch (error) {
      lease.dispose();
      reportFallbackSeam("object", "renderError");
      console.error("[jgengine:static-objects] harvest failed", model.url, error);
      return;
    }
    if (result === null) {
      // Nothing instanceable: every object draws through the individual renderer.
      lease.dispose();
      env.singles.clearPrefix("fallback:");
      for (const object of batch.objects) {
        const live = env.ctx.scene.object.get(object.instanceId);
        if (live !== null) env.singles.set(`fallback:${live.instanceId}`, live);
      }
      return;
    }
    harvested = { ...result, lease };
    reportSourceMeasures(env.ctx, result, batch);
    const radius = sourceRadius(result.sources);
    env.singles.clearPrefix("fallback:");

    if (radius >= IMPOSTOR_MIN_RADIUS) {
      content = impostorStaticDraw(env, {
        batch,
        model,
        objects: () => membership.objects,
        sources: result.sources,
        radius,
      });
      contentMounted = new MountedDraw(content, group);
      contentMounted.mount(state);
      return;
    }
    const driver = new StaticMembersDriver(env, batch, () => membership.objects, undefined, undefined, () => true);
    members = driver;
    driver.mount();
    result.sources.forEach((source, index) => {
      const draw = objectSourceDraw(env, { source, members: driver, objects: () => membership.objects });
      const mounted = new MountedDraw(draw, group);
      mounted.mount(state);
      children.set(`source:${index}`, mounted);
    });
  };

  return {
    mount(state: EngineFrameState) {
      stateRef = state;
      state.scene.add(group);
      void build(state).catch((error) => {
        reportFallbackSeam("object", "renderError");
        console.error("[jgengine:static-objects] batch load failed", model.url, error);
      });
    },
    update(state: EngineFrameState) {
      stateRef = state;
      for (const child of children.values()) child.update(state);
      contentMounted?.update(state);
      members?.poke();
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      clearContent(state);
      stateRef = null;
      state.scene.remove(group);
    },
  };
}

/**
 * Render compatible authored or `scenery` props as shared model draws, preserving unsupported models â€”
 * the draw-side `StaticObjectModels`. Objects that cannot batch (excluded at runtime, uninstanceable
 * levels, failed harvests) are reported through `singles` for the React `single` renderer.
 * @internal
 */
export function staticObjectBatchDraw(getEnv: () => {
  ctx: GameContext;
  batch: StaticObjectBatch;
  visibility(): (id: string) => boolean;
  changes: VisibilityChanges;
  reportSingles(objects: readonly SceneObject[]): void;
}): EngineDraw {
  const group = new THREE.Group();
  const singles = new StaticSingles((objects) => getEnv().reportSingles(objects));
  let membership: BatchMembership | null = null;
  let content: EngineDraw | null = null;
  let contentMounted: MountedDraw | null = null;
  let cancelled = false;
  let stateRef: EngineFrameState | null = null;
  let resolved: BuiltLodModel | null = null;
  let lastFov = Number.NaN;
  let leaveFov: (() => void) | null = null;
  let leaveFlush: (() => void) | null = null;

  const clearContent = (state: EngineFrameState) => {
    contentMounted?.dispose(state);
    contentMounted = null;
    content = null;
    membership?.dispose();
    membership = null;
  };

  const buildContent = (state: EngineFrameState, model: ModelConfig, meta: BuiltLodMeta | null) => {
    const live = getEnv();
    const batch = live.batch;
    const drawn: StaticObjectBatch = model === batch.model ? batch : { ...batch, model };
    const nextEnv: StaticBatchEnv = { ctx: live.ctx, visibility: live.visibility, changes: live.changes, singles };
    const member = new BatchMembership(nextEnv, drawn);
    membership = member;
    member.mount();
    content = drawn.model.variants === undefined
      ? loadedStaticDraw(nextEnv, { batch: drawn, model, membership: member })
      : variantStaticDraw(nextEnv, { batch: drawn, objects: () => member.objects, meta });
    contentMounted = new MountedDraw(content, group);
    contentMounted.mount(state);
  };

  const resolveAndBuild = async (state: EngineFrameState) => {
    const live = getEnv();
    const fov = cameraFov(state.camera);
    const next = await resolveBuiltLodModel(live.batch.model, true, fov, currentMeshLodGame());
    if (cancelled || stateRef === null) return;
    resolved = next;
    buildContent(state, next.model, next.meta);
  };

  return {
    mount(state: EngineFrameState) {
      stateRef = state;
      state.scene.add(group);
      lastFov = cameraFov(state.camera);
      leaveFov = joinFrameTask(0, (frameState) => {
        const fov = cameraFov(frameState.camera);
        if (fov === lastFov) return;
        // A zoom past a whole degree re-resolves the built levels, like the old fov memo did.
        lastFov = fov;
        void (async () => {
          const live = getEnv();
          const next = await resolveBuiltLodModel(live.batch.model, true, fov, currentMeshLodGame());
          if (cancelled || stateRef === null) return;
          if (resolved !== null && next.model === resolved.model && next.meta === resolved.meta) return;
          clearContent(stateRef);
          resolved = next;
          buildContent(stateRef, next.model, next.meta);
        })().catch((error) => {
          reportFallbackSeam("object", "renderError");
          console.error("[jgengine:static-objects] level resolve failed", getEnv().batch.model.url, error);
        });
      });
      leaveFlush = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.35, () => singles.flush());
      void resolveAndBuild(state).catch((error) => {
        reportFallbackSeam("object", "renderError");
        console.error("[jgengine:static-objects] level resolve failed", getEnv().batch.model.url, error);
      });
    },
    update(state: EngineFrameState) {
      stateRef = state;
      contentMounted?.update(state);
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      leaveFov?.();
      leaveFlush?.();
      clearContent(state);
      stateRef = null;
      state.scene.remove(group);
    },
  };
}

/**
 * Keeps the scene's static draw pool on the game's far-cell proxy settings and switches each cell
 * between its batches and its proxy as the camera moves.
 * @internal
 */
export function staticDrawPoolDriverDraw(getHlod: () => HlodConfig | undefined): EngineDraw {
  let pool: ReturnType<typeof staticDrawPoolFor> | null = null;
  const eye = new THREE.Vector3();
  let leave: (() => void) | null = null;
  let applied: { distance: number; hysteresis: number; cluster: number } | null | undefined;
  const configure = () => {
    const hlod = getHlod();
    const distance = hlod?.distance;
    const hysteresis = hlod?.hysteresis;
    const cluster = hlod?.cluster;
    const next = distance === undefined || hysteresis === undefined || cluster === undefined ? null : { distance, hysteresis, cluster };
    if (applied !== undefined && next !== null && applied !== null &&
      next.distance === applied.distance && next.hysteresis === applied.hysteresis && next.cluster === applied.cluster) return;
    if (next === null && applied === null) return;
    applied = next;
    pool?.configure(next);
  };
  return {
    mount(state: EngineFrameState) {
      pool = staticDrawPoolFor(state.rootScene ?? state.scene);
      configure();
      leave = joinFrameTask(CAMERA_POST_FRAME_PRIORITY + 0.18, (frameState) => {
        if (getHlod()?.distance !== undefined) pool?.update(frameState.camera.getWorldPosition(eye));
      });
    },
    update() {
      configure();
    },
    dispose() {
      leave?.();
      pool?.configure(null);
      pool = null;
      applied = undefined;
    },
  };
}

/** Render compatible authored or `scenery` props as shared model draws, preserving unsupported models. Re-renders only when its batch or renderer changes. @internal */
export const StaticObjectModels = memo(function StaticObjectModels({ batch, single }: { batch: StaticObjectBatch; single: (object: SceneObject) => ReactNode }) {
  const ctx = useGameContext();
  const visibility = useRenderVisibility();
  const changes = useVisibilityChangesSource();
  const [singles, setSingles] = useState<readonly SceneObject[]>([]);
  const latest = useRef({ ctx, batch, visibility, changes, single });
  latest.current = { ctx, batch, visibility, changes, single };
  const report = useCallback((objects: readonly SceneObject[]) => {
    setSingles((previous) =>
      previous.length === objects.length && previous.every((object, index) => object === objects[index])
        ? previous
        : objects.slice());
  }, []);
  useEngineDraw(
    () => staticObjectBatchDraw(() => {
      const live = latest.current;
      return {
        ctx: live.ctx,
        batch: live.batch,
        visibility: () => live.visibility.current,
        changes: live.changes,
        reportSingles: report,
      };
    }),
    [batch],
  );
  const renderSingle = latest.current.single;
  return (
    <>
      {singles.map((object) => (
        <Fragment key={object.instanceId}>{renderSingle(object)}</Fragment>
      ))}
    </>
  );
});

/**
 * Keeps the scene's static draw pool on the game's far-cell proxy settings and switches each cell
 * between its batches and its proxy as the camera moves.
 * @internal
 */
export function StaticDrawPoolDriver({ hlod }: { hlod: HlodConfig | undefined }) {
  const latest = useRef(hlod);
  latest.current = hlod;
  useEngineDraw(() => staticDrawPoolDriverDraw(() => latest.current), []);
  return null;
}
