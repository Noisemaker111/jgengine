import { useRef } from "react";
import * as THREE from "three";

import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { ScatterInstance } from "@jgengine/core/scatter/scatterRegion";
import { beginFallbackSeam, reportFallbackSeam } from "@jgengine/core/devtools/fallbackSeams";
import { createModelVariantSelector, type ModelVariantSelector } from "@jgengine/core/lod/modelLod";
import { trackSceneWork } from "@jgengine/core/model/modelLoad.draw";

import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { groupInstancesByCell } from "@jgengine/core/instancing/instanceCells";
import { composeInstance, uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { LEVEL_PASS_MIN_CAMERA_MOVE, levelPassNeeded } from "@jgengine/core/lod/levelPass.draw";
import { variantLevelModel } from "@jgengine/core/lod/singleVariantLod.draw";
import { preloadSceneModel } from "@jgengine/core/model/entityModelDraw.draw";
import { buildScatterProxy } from "./scatterProxies.draw";
import { buildScatterModelSources, disposeScatterModelSources, type ScatterModelSource } from "./scatterModels.draw";
import { writeScatterVariantLevel } from "./scatterVariants.draw";
import { detailDrawDistance, IMPOSTOR_MIN_RADIUS, sourceRadius } from "@jgengine/core/lod/impostor.draw";
import { terrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { scatterImpostorFieldDraw } from "./ScatterImpostorField.draw";
import { cameraFov, currentMeshLodGame, resolveBuiltLodModel } from "@jgengine/core/lod/builtLods.draw";
import { builtLevelSource, reskinBuiltLevel } from "@jgengine/core/lod/builtLods.draw";
import { meshLodSettings } from "@jgengine/core/lod/builtLods";
import { DEFAULT_MESH_LOD_HYSTERESIS } from "@jgengine/core/lod/builtLods";
import { bakeGeneratorVariants, getGenerator, prepareGeneratorVariants, type GeneratorDefinition } from "@jgengine/core/generator/generator";
import { getGeneratorMesh } from "@jgengine/core/generator/generatorMesh.draw";
import { scatterHeroesDraw } from "./ScatterHeroes.draw";
import { freezeStaticTransforms } from "@jgengine/core/model/staticTransforms.draw";
import { staticDrawPoolFor, StaticDrawSlot, type PooledPlacement, type StaticDrawPool } from "@jgengine/core/instancing/staticDrawPool.draw";
import { staticPoolCellAt } from "@jgengine/core/instancing/staticObjectBatches.draw";
import {
  assignScatterVariants,
  coarserScatterLevels,
  isScatterGeneratorItem,
  isUniqueScatterItem,
  parseScatterVariantItem,
  scatterGeneratorBase,
  scatterGeneratorVariantCount,
  type ScatterGeneratorItem,
} from "./scatterGenerator";

/** Chunk edge (m): dense fields split into this-sized buckets, each frustum-culled independently. */
const DEFAULT_CHUNK_SIZE = 24;
const DEFAULT_MAX_INSTANCES = 20000;
/** Most chunks one field splits into; past it chunks grow, so an island costs hundreds of objects, not tens of thousands. */
const DEFAULT_MAX_CHUNKS = 400;

/**
 * Chunk edge for a field: `chunkSize`, grown until the field's footprint fits in `maxChunks` chunks.
 * Every chunk is one scene object per species and draw source, walked every frame even when culled,
 * so a fixed 24 m grid over a 2 km island would be most of the frame before a triangle is drawn.
 * @internal
 */
export function scatterChunkSize(instances: readonly { x: number; z: number }[], chunkSize: number, maxChunks: number): number {
  if (instances.length === 0) return chunkSize;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const instance of instances) {
    minX = Math.min(minX, instance.x);
    maxX = Math.max(maxX, instance.x);
    minZ = Math.min(minZ, instance.z);
    maxZ = Math.max(maxZ, instance.z);
  }
  return Math.max(chunkSize, Math.ceil(Math.sqrt(((maxX - minX) * (maxZ - minZ)) / Math.max(1, maxChunks))));
}

/**
 * At most `max` instances. Over budget the field thins evenly (every region keeps the same share)
 * instead of being cut off in document order, which would leave whole regions bare. @internal
 */
export function capScatterInstances<T>(instances: readonly T[], max: number): readonly T[] {
  if (instances.length <= max) return instances;
  const kept: T[] = [];
  const stride = instances.length / Math.max(1, max);
  for (let i = 0; i < max; i += 1) kept.push(instances[Math.floor(i * stride)]!);
  return kept;
}

/** One instanced draw unit - a single species within a single spatial chunk. @internal */
export interface ScatterBatch {
  key: string;
  item: string;
  /** Per-instance transforms, parallel to `instances`. */
  matrices: THREE.Matrix4[];
  /** The placements themselves, so the level pass can read a stable id and a world position. */
  instances: ScatterInstance[];
}

/** Groups resolved instances by spatial chunk then species so each batch is one cullable draw. @internal */
export function scatterBatchInstances(instances: readonly ScatterInstance[], chunkSize: number): ScatterBatch[] {
  const batches: ScatterBatch[] = [];
  for (const chunk of groupInstancesByCell(instances, chunkSize, (instance) => [instance.x, instance.z])) {
    const byItem = new Map<string, { matrices: THREE.Matrix4[]; instances: ScatterInstance[] }>();
    for (const instance of chunk.items) {
      const matrix = composeInstance(new THREE.Matrix4(), [instance.x, instance.y, instance.z], [0, instance.rotationY, 0], instance.scale);
      const bucket = byItem.get(instance.item);
      if (bucket === undefined) byItem.set(instance.item, { matrices: [matrix], instances: [instance] });
      else {
        bucket.matrices.push(matrix);
        bucket.instances.push(instance);
      }
    }
    for (const [item, bucket] of byItem) {
      batches.push({ key: `${chunk.key}:${item}`, item, matrices: bucket.matrices, instances: bucket.instances });
    }
  }
  return batches;
}

/**
 * Drops hidden placements from the batches that hold them. Every other batch comes back as the same
 * object, so felling one tree re-uploads one chunk instead of rebuilding the whole field.
 * @internal
 */
export function hideScatterPlacements(batches: readonly ScatterBatch[], hidden: ReadonlySet<string> | undefined): ScatterBatch[] {
  if (hidden === undefined || hidden.size === 0) return [...batches];
  const shown: ScatterBatch[] = [];
  for (const batch of batches) {
    if (!batch.instances.some((instance) => hidden.has(instance.id))) {
      shown.push(batch);
      continue;
    }
    const matrices: THREE.Matrix4[] = [];
    const instances: ScatterInstance[] = [];
    batch.instances.forEach((instance, index) => {
      if (hidden.has(instance.id)) return;
      instances.push(instance);
      matrices.push(batch.matrices[index]!);
    });
    if (instances.length > 0) shown.push({ key: batch.key, item: batch.item, matrices, instances });
  }
  return shown;
}

/** Forwards mount/frame/update/dispose to a fixed list of child draws. @internal */
function childrenDraw(children: readonly EngineDraw[], teardown?: () => void): EngineDraw {
  return {
    mount(state) {
      for (const child of children) child.mount?.(state);
    },
    frame(state) {
      for (const child of children) child.frame?.(state, state.delta);
    },
    update(state) {
      for (const child of children) child.update?.(state);
    },
    dispose(state) {
      for (const child of children) child.dispose?.(state);
      teardown?.();
    },
  };
}

/**
 * A draw that resolves `load` into a child draw once it lands, then forwards frames to it. A load
 * that rejects or lands after dispose reports through `fail`, the surface the Suspense boundary's
 * error path used to be.
 * @internal
 */
function asyncChildDraw(load: (state: EngineFrameState) => Promise<EngineDraw | null>, fail: (error: unknown) => void): EngineDraw {
  let inner: EngineDraw | null = null;
  let disposed = false;
  return {
    mount(state) {
      void load(state).then((draw) => {
        if (disposed || draw === null) {
          draw?.dispose?.(state);
          return;
        }
        inner = draw;
        draw.mount?.(state);
      }).catch(fail);
    },
    frame(state) {
      inner?.frame?.(state, state.delta);
    },
    update(state) {
      inner?.update?.(state);
    },
    dispose(state) {
      disposed = true;
      inner?.dispose?.(state);
      inner = null;
    },
  };
}

/** One species-in-a-chunk InstancedMesh: a proxy batch's placements as a single GPU-instanced draw. */
function scatterBatchMeshDraw(batch: ScatterBatch, geometry: THREE.BufferGeometry): EngineDraw {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  let mesh: THREE.InstancedMesh | null = null;
  return {
    mount(state) {
      mesh = new THREE.InstancedMesh(geometry, material, batch.matrices.length);
      mesh.name = `scatter:${batch.item}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      uploadInstances(mesh, batch.matrices);
      freezeStaticTransforms(mesh);
      state.scene.add(mesh);
    },
    dispose(state) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh.dispose();
        mesh = null;
      }
      material.dispose();
    },
  };
}

/** Which placements of one chunk each detail level draws, refilled by {@link pickDetailPlacements}. @internal */
export interface DetailPicks {
  /** Per placement: the level it draws at, or -1 past the draw distance. */
  readonly level: Int8Array;
  /** Per level: the placement indices it draws, the first `counts[level]` of them. */
  readonly members: Int32Array[];
  readonly counts: Int32Array;
  /** `counts` before the last pick. */
  readonly previous: Int32Array;
  /** Per level: 1 when its list changed in the last pick, so its draws upload again. */
  readonly dirty: Uint8Array;
}

/** Empty picks for a chunk of `placements` over `levels` detail levels. @internal */
export function createDetailPicks(placements: number, levels: number): DetailPicks {
  return {
    level: new Int8Array(placements).fill(-1),
    members: Array.from({ length: levels }, () => new Int32Array(placements)),
    counts: new Int32Array(levels),
    previous: new Int32Array(levels),
    dirty: new Uint8Array(levels),
  };
}

/**
 * Sort one chunk's placements into detail levels by each one's own ground distance to the camera,
 * holding a level across the `hysteresis` band ({@link placementLevel}), and leave out the ones past
 * `reach`. A chunk can span hundreds of metres, so a level chosen per chunk drew its far placements at
 * full detail whenever the camera stood near its edge. Returns true when any level's list changed.
 * @internal
 */
export function pickDetailPlacements(
  picks: DetailPicks,
  levels: readonly { maxDistance: number }[],
  placements: readonly { x: number; z: number }[],
  cameraX: number,
  cameraZ: number,
  reach: number,
  hysteresis: number,
): boolean {
  const { level: chosen, members, counts, previous, dirty } = picks;
  dirty.fill(0);
  previous.set(counts);
  counts.fill(0);
  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    if (placement === undefined) continue;
    const dx = placement.x - cameraX;
    const dz = placement.z - cameraZ;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const level = distance > reach ? -1 : placementLevel(levels, distance, chosen[index] ?? -1, hysteresis);
    chosen[index] = level;
    const list = members[level];
    if (list === undefined) continue;
    const slot = counts[level] ?? 0;
    if (list[slot] !== index) {
      list[slot] = index;
      dirty[level] = 1;
    }
    counts[level] = slot + 1;
  }
  let changed = false;
  for (let level = 0; level < counts.length; level += 1) {
    if (counts[level] !== previous[level]) dirty[level] = 1;
    if (dirty[level] === 1) changed = true;
  }
  return changed;
}

/** Empty every level of a chunk the camera is out of reach of; true when it held anything. @internal */
export function clearDetailPicks(picks: DetailPicks): boolean {
  picks.dirty.fill(0);
  let changed = false;
  for (let level = 0; level < picks.counts.length; level += 1) {
    if (picks.counts[level] === 0) continue;
    picks.counts[level] = 0;
    picks.dirty[level] = 1;
    changed = true;
  }
  if (changed) picks.level.fill(-1);
  return changed;
}

function uploadPicked(mesh: THREE.InstancedMesh, batch: ScatterBatch, picks: DetailPicks, level: number, localMatrix: THREE.Matrix4): void {
  const members = picks.members[level];
  const count = members === undefined ? 0 : (picks.counts[level] ?? 0);
  uploadInstances(mesh, {
    count,
    at: (index, out) => {
      const matrix = batch.matrices[members?.[index] ?? -1];
      if (matrix !== undefined) out.copy(matrix);
    },
  }, { localMatrix });
}

/**
 * One chunk's draw of one level and source: its share of the shared static batches, where every chunk,
 * variant and species with the same material draws together, or its own instanced mesh when the
 * batches cannot take its material (see-through, custom shader).
 */
type DetailDraw = THREE.InstancedMesh | StaticDrawSlot;

/** A detail field's draws, by chunk, level and draw source: a slot holds a draw only while its level picks a placement. */
type DetailMeshes = (DetailDraw | undefined)[][][];

/** A placement of a chunk as a shared-batch member; scatter names no scene object, so picking reports none. */
interface DetailPlacement extends PooledPlacement {
  readonly index: number;
}

const detailPlacements = new WeakMap<ScatterBatch, readonly DetailPlacement[]>();

function placementsOf(batch: ScatterBatch): readonly DetailPlacement[] {
  let known = detailPlacements.get(batch);
  if (known === undefined) {
    known = batch.instances.map((_, index) => ({ instanceId: "", index }));
    detailPlacements.set(batch, known);
  }
  return known;
}

const detailSlotOf = (placement: DetailPlacement): number => placement.index;

function detailMatrixOf(batch: ScatterBatch, local: THREE.Matrix4): (placement: DetailPlacement, out: THREE.Matrix4) => THREE.Matrix4 {
  return (placement, out) => out.multiplyMatrices(batch.matrices[placement.index] ?? IDENTITY, local);
}

function acquireDetailSlot(pool: StaticDrawPool, batch: ScatterBatch, source: ScatterModelSource): StaticDrawSlot | null {
  const footprint = scatterBatchFootprint(batch);
  const slot = pool.acquire(
    { geometry: source.geometry, material: source.material, castShadow: source.skipShadow !== true, receiveShadow: true },
    staticPoolCellAt(footprint.x, footprint.z),
    batch.instances.length,
    "own",
  );
  slot?.place(placementsOf(batch), detailSlotOf, detailMatrixOf(batch, source.localMatrix));
  return slot;
}

function addDetailMesh(field: THREE.Object3D, source: ScatterModelSource, count: number, name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(source.geometry, source.material, count);
  mesh.name = name;
  mesh.castShadow = source.skipShadow !== true;
  mesh.receiveShadow = true;
  field.add(mesh);
  freezeStaticTransforms(mesh);
  return mesh;
}

function showPicked(slot: StaticDrawSlot, batch: ScatterBatch, picks: DetailPicks, level: number, local: THREE.Matrix4): void {
  const members = picks.members[level];
  const count = members === undefined ? 0 : (picks.counts[level] ?? 0);
  const all = placementsOf(batch);
  const shown: DetailPlacement[] = [];
  for (let index = 0; index < count; index += 1) {
    const placement = all[members?.[index] ?? -1];
    if (placement !== undefined) shown.push(placement);
  }
  slot.sync(shown, detailSlotOf, detailMatrixOf(batch, local));
}

function dropDetailDraw(field: THREE.Object3D, draw: DetailDraw): void {
  if (draw instanceof StaticDrawSlot) {
    draw.release();
    return;
  }
  field.remove(draw);
  draw.dispose();
}

/**
 * Bring one chunk's draws of one level in line with its picks: a draw source that now holds placements
 * gets a draw and their transforms, and one that holds none gives its draw back. With a `pool` the
 * draw is a slot of the shared static batches, so the frame's draw count follows the materials in
 * view rather than chunks times variants times levels; without one, or for a material the batches
 * cannot take, it is an instanced mesh under `field`. An empty mesh still costs three's scene walks
 * (every render pass visits every child) and an island holds tens of thousands of chunk, level and
 * source slots, so keeping them all made the frame grow with the world instead of the view.
 * @internal
 */
export function syncDetailDraws(
  field: THREE.Object3D,
  meshes: DetailMeshes,
  batchIndex: number,
  batch: ScatterBatch,
  picks: DetailPicks,
  levelIndex: number,
  sources: readonly ScatterModelSource[],
  pool: StaticDrawPool | null = null,
): void {
  const row = ((meshes[batchIndex] ??= [])[levelIndex] ??= []);
  const count = picks.counts[levelIndex] ?? 0;
  sources.forEach((source, sourceIndex) => {
    let draw = row[sourceIndex];
    if (count === 0) {
      if (draw === undefined) return;
      dropDetailDraw(field, draw);
      row[sourceIndex] = undefined;
      return;
    }
    if (draw === undefined) {
      draw = (pool === null ? null : acquireDetailSlot(pool, batch, source)) ?? addDetailMesh(field, source, count, `scatter:${batch.item}`);
      row[sourceIndex] = draw;
    }
    if (draw instanceof StaticDrawSlot) showPicked(draw, batch, picks, levelIndex, source.localMatrix);
    else uploadPicked(draw, batch, picks, levelIndex, source.localMatrix);
  });
}

/** Give back every draw of a detail field: meshes leave the scene and free their buffers, slots return to the shared batches. @internal */
export function clearDetailDraws(field: THREE.Object3D, meshes: DetailMeshes): void {
  for (const levels of meshes) for (const row of levels ?? []) for (const draw of row ?? []) {
    if (draw !== undefined) dropDetailDraw(field, draw);
  }
  meshes.length = 0;
}

/**
 * One detail level's draw source, instanced across every chunk of one species. Each frame it asks the
 * shared variant selector for each placement's level and draws only the ones it owns, composing into
 * a reserved matrix slot so the far level's instances cost a second instanced draw, not per-frame
 * allocation. A cell that holds near and far placements feeds both levels from the same batch.
 */
function scatterVariantSourceDraw({ source, batch, level, selector }: {
  source: ScatterModelSource;
  batch: ScatterBatch;
  level: number;
  selector: ModelVariantSelector;
}): EngineDraw {
  const slots = batch.matrices.map(() => new THREE.Matrix4());
  const cameraPosition = new THREE.Vector3();
  const lastCamera = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
  let mesh: THREE.InstancedMesh | null = null;
  const writeLevel = (from: THREE.Vector3) => {
    if (mesh === null) return;
    const count = writeScatterVariantLevel(
      level,
      selector,
      from,
      batch.instances,
      batch.matrices,
      source.localMatrix,
      slots,
    );
    uploadInstances(mesh, { count, at: (index, out) => out.copy(slots[index]!) });
  };
  return {
    priority: CAMERA_POST_FRAME_PRIORITY + 0.1,
    mount(state) {
      mesh = new THREE.InstancedMesh(source.geometry, source.material, batch.matrices.length);
      mesh.name = `scatter:${batch.item}`;
      mesh.castShadow = source.skipShadow !== true && (source.castShadow ?? true);
      mesh.receiveShadow = source.receiveShadow ?? true;
      state.camera.getWorldPosition(cameraPosition);
      lastCamera.copy(cameraPosition);
      writeLevel(cameraPosition);
      freezeStaticTransforms(mesh);
      state.scene.add(mesh);
    },
    frame(state) {
      state.camera.getWorldPosition(cameraPosition);
      if (!levelPassNeeded(lastCamera, cameraPosition, LEVEL_PASS_MIN_CAMERA_MOVE)) return;
      lastCamera.copy(cameraPosition);
      writeLevel(cameraPosition);
    },
    dispose(state) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh.dispose();
        mesh = null;
      }
    },
  };
}

/** Renders one level of a variant model: the level's own GLB harvested into instanced draws. */
function scatterVariantLevelDraw({ model, url, level, selector, batches }: {
  model: ModelConfig;
  url: string;
  level: number;
  selector: ModelVariantSelector;
  batches: ScatterBatch[];
}): EngineDraw {
  return asyncChildDraw(async () => {
    const gltf = await preloadSceneModel(url);
    const { sources, root } = buildScatterModelSources(gltf.scene, variantLevelModel(model, level));
    const children = sources.flatMap((source) => batches.map((batch) => scatterVariantSourceDraw({ source, batch, level, selector })));
    return childrenDraw(children, () => disposeScatterModelSources(root));
  }, (error) => {
    console.error(`[jgengine] scatter level ${url} failed to load`, error);
    reportFallbackSeam("scatter", "renderError");
  });
}

/**
 * A species whose model declares detail levels: one GLB per level, each level's instanced draws
 * claiming only the placements the one shared selector put on it. The selector lives here so a
 * placement keeps its hysteresis across every level component instead of each level deciding alone.
 */
function scatterVariantSpeciesDraw({ model, batches }: { model: ModelConfig; batches: ScatterBatch[] }): EngineDraw {
  const variants = model.variants!;
  const selector = createModelVariantSelector(variants);
  const children = variants.levels.map((level, index) =>
    scatterVariantLevelDraw({ model, url: level.url, level: index, selector, batches }));
  return childrenDraw(children, () => selector.clear());
}

/** A batch's footprint on the ground: its centre and the radius that reaches its farthest placement. @internal */
export function scatterBatchFootprint(batch: ScatterBatch): { x: number; z: number; radius: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const instance of batch.instances) {
    minX = Math.min(minX, instance.x);
    maxX = Math.max(maxX, instance.x);
    minZ = Math.min(minZ, instance.z);
    maxZ = Math.max(maxZ, instance.z);
  }
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, radius: Math.hypot(maxX - minX, maxZ - minZ) / 2 };
}

/** One detail level of a chunked species: its draw sources and how far (metres to a chunk's near edge) it draws. */
interface ScatterChunkLevel {
  sources: ScatterModelSource[];
  maxDistance: number;
}

/** Metres from the camera past which a scatter placement's shadow cannot resolve in the map. */
const SCATTER_SHADOW_DISTANCE = 250;

/**
 * The coarsest detail band of a species draws far enough out that its shadow is under a shadow-map
 * texel, so its sources stop paying the depth pass; every nearer band keeps casting.
 * @internal
 */
export function withoutFarShadows(levels: readonly ScatterChunkLevel[]): ScatterChunkLevel[] {
  if (levels.length < 2) return [...levels];
  const last = levels.length - 1;
  const bandStart = levels[last - 1]?.maxDistance ?? 0;
  if (!Number.isFinite(bandStart) || bandStart < SCATTER_SHADOW_DISTANCE) return [...levels];
  const top = levels[last]!;
  return [...levels.slice(0, last), { ...top, sources: top.sources.map((source) => ({ ...source, skipShadow: true })) }];
}

/**
 * Small-detail species (below impostor size): each placement draws only within
 * {@link detailDrawDistance} of the camera, so a field the size of an island draws the plants near the
 * camera and not every pebble on it. A species with built levels draws each placement at the level its
 * own distance picks, with `hysteresis` (a share of each switch distance). A chunk the camera is out of
 * reach of is skipped whole, and the pass runs again only when the camera has moved.
 */
function scatterDetailDraw({ levels, batches, radius, hysteresis = 0 }: { levels: readonly ScatterChunkLevel[]; batches: ScatterBatch[]; radius: number; hysteresis?: number }): EngineDraw {
  const footprints = batches.map(scatterBatchFootprint);
  const picks = batches.map((batch) => createDetailPicks(batch.instances.length, levels.length));
  const group = new THREE.Group();
  const meshes: DetailMeshes = [];
  const cameraPosition = new THREE.Vector3();
  const lastCamera = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
  let pool: StaticDrawPool | null = null;
  let reach = 0;
  let lastQuality: ReturnType<typeof terrainQuality> | null = null;
  return {
    priority: CAMERA_POST_FRAME_PRIORITY + 0.1,
    mount(state) {
      state.scene.add(group);
      // The pool keys on the real scene, matching what useThree(state => state.scene) returned.
      pool = staticDrawPoolFor(state.rootScene ?? state.scene);
      lastQuality = terrainQuality();
      reach = detailDrawDistance(radius, lastQuality);
    },
    frame(state) {
      const active = pool;
      if (active === null) return;
      const quality = terrainQuality();
      if (quality !== lastQuality) {
        lastQuality = quality;
        reach = detailDrawDistance(radius, quality);
        // A new reach re-picks every chunk, as the remounted memos did.
        lastCamera.set(Number.POSITIVE_INFINITY, 0, 0);
      }
      state.camera.getWorldPosition(cameraPosition);
      if (!levelPassNeeded(lastCamera, cameraPosition, LEVEL_PASS_MIN_CAMERA_MOVE)) return;
      lastCamera.copy(cameraPosition);
      for (let index = 0; index < footprints.length; index += 1) {
        const footprint = footprints[index];
        const batch = batches[index];
        const pick = picks[index];
        if (footprint === undefined || batch === undefined || pick === undefined) continue;
        const near = Math.hypot(cameraPosition.x - footprint.x, cameraPosition.z - footprint.z) - footprint.radius;
        const changed = near > reach
          ? clearDetailPicks(pick)
          : pickDetailPlacements(pick, levels, batch.instances, cameraPosition.x, cameraPosition.z, reach, hysteresis);
        if (!changed) continue;
        levels.forEach((level, levelIndex) => {
          if (pick.dirty[levelIndex] === 1) syncDetailDraws(group, meshes, index, batch, pick, levelIndex, level.sources, active);
        });
      }
    },
    dispose(state) {
      clearDetailDraws(group, meshes);
      for (const pick of picks) clearDetailPicks(pick);
      state.scene.remove(group);
      pool = null;
    },
  };
}

/**
 * The level a placement at `distance` draws: the first whose `maxDistance` it is inside, holding
 * `current` until it is a `hysteresis` share past the edge it would cross.
 * @internal
 */
export function placementLevel(levels: readonly { maxDistance: number }[], distance: number, current: number, hysteresis: number): number {
  let level = levels.length - 1;
  for (let index = 0; index < levels.length; index += 1) {
    if (distance <= (levels[index]?.maxDistance ?? Number.POSITIVE_INFINITY)) {
      level = index;
      break;
    }
  }
  if (current < 0 || current >= levels.length || current === level) return level;
  const edge = current < level ? levels[current]?.maxDistance : levels[level]?.maxDistance;
  if (edge === undefined || !Number.isFinite(edge)) return level;
  const band = edge * hysteresis;
  return current < level ? (distance > edge + band ? level : current) : (distance <= edge - band ? level : current);
}

/**
 * Loads one species' real catalog GLB once, harvests its instanceable draw sources, then GPU-instances
 * them across every chunk that species appears in. A species big enough to read from afar (trees,
 * rocks, huts) draws its distant placements as impostor cards in one draw for the whole field; a
 * smaller one stops drawing past its detail distance.
 */
function scatterSingleSpeciesDraw({ model, batches }: { model: ModelConfig; batches: ScatterBatch[] }): EngineDraw {
  const game = currentMeshLodGame();
  return asyncChildDraw(async (state) => {
    const resolved = await resolveBuiltLodModel(model, false, cameraFov(state.camera), game);
    const resolvedModel = resolved.model;
    return scatterBuiltSpeciesDraw({
      model,
      levels: resolvedModel.variants?.levels ?? null,
      hysteresis: resolvedModel.variants?.hysteresisRatio ?? 0,
      batches,
      cacheKey: `scatter:${model.url}:${JSON.stringify(model)}`,
    });
  }, (error) => {
    console.error(`[jgengine] scatter species ${model.url} failed to resolve`, error);
    reportFallbackSeam("scatter", "renderError");
  });
}

/** A catalog species and the built levels it switches through per chunk (none when nothing was built). */
function scatterBuiltSpeciesDraw({ model, levels, hysteresis, batches, cacheKey }: {
  model: ModelConfig;
  levels: readonly { url: string; maxDistance?: number }[] | null;
  hysteresis: number;
  batches: ScatterBatch[];
  cacheKey: string;
}): EngineDraw {
  const urls = levels === null ? [model.url] : levels.map((level) => level.url);
  return asyncChildDraw(async () => {
    const gltfs = await Promise.all(urls.map((url) => preloadSceneModel(url)));
    const harvested = gltfs.map((gltf, index) => {
      const url = urls[index] ?? model.url;
      const built = builtLevelSource(url);
      const source = gltfs[0];
      if (built !== null && source !== undefined) reskinBuiltLevel(gltf.scene, source);
      return buildScatterModelSources(gltf.scene, { ...model, url }, built?.bounds);
    });
    const chunkLevels: ScatterChunkLevel[] = withoutFarShadows(harvested.map(({ sources }, index) => ({
      sources,
      maxDistance: levels?.[index]?.maxDistance ?? Infinity,
    })));
    const field = scatterSourcesFieldDraw({ cacheKey, levels: chunkLevels, batches, hysteresis });
    return {
      mount: (state: EngineFrameState) => field.mount?.(state),
      frame: (state: EngineFrameState) => field.frame?.(state, state.delta),
      update: (state: EngineFrameState) => field.update?.(state),
      dispose: (state: EngineFrameState) => {
        field.dispose?.(state);
        for (const { root } of harvested) disposeScatterModelSources(root);
      },
    };
  }, (error) => {
    console.error(`[jgengine] scatter species ${model.url} failed to load`, error);
    reportFallbackSeam("scatter", "renderError");
  });
}

/** A species draw: big ones get the impostor far field, small ones stop past their detail distance. */
function scatterSourcesFieldDraw({ cacheKey, sources: given, levels: chunkLevels, farSources, batches, hysteresis }: {
  cacheKey: string;
  sources?: ScatterModelSource[];
  levels?: readonly ScatterChunkLevel[];
  farSources?: ScatterModelSource[] | undefined;
  batches: ScatterBatch[];
  hysteresis?: number;
}): EngineDraw {
  const levels = chunkLevels ?? [{ sources: given ?? [], maxDistance: Infinity }];
  const sources = levels[0]?.sources ?? [];
  const radius = sourceRadius(sources);
  if (radius >= IMPOSTOR_MIN_RADIUS) {
    return scatterImpostorFieldDraw({ cacheKey, sources, farSources, batches, radius });
  }
  return scatterDetailDraw({ levels, batches, radius, ...(hysteresis === undefined ? {} : { hysteresis }) });
}

const IDENTITY = new THREE.Matrix4();
const NO_HEROES: ReadonlySet<string> = new Set();
/** Generated meshes smaller than this bounding radius (metres) skip the shadow pass. */
const SMALL_SHADOW_RADIUS = 0.6;

/** One generator-grown species, resolved: the generator, the item, and its placements per variant. */
interface ScatterGeneratorSpeciesDraw {
  definition: GeneratorDefinition;
  spec: ScatterGeneratorItem;
  byVariant: Map<number, ScatterBatch[]>;
}

/** One bake of a generator's variants: the definition with the details to bake as its `lods`, the base params, the variant options. */
interface GeneratorBake {
  definition: GeneratorDefinition;
  base: Parameters<typeof bakeGeneratorVariants>[1];
  options: Parameters<typeof bakeGeneratorVariants>[2];
}

function collectBakedGeometries(variants: readonly (readonly (readonly ScatterModelSource[])[])[]): THREE.BufferGeometry[] {
  return variants.flatMap((levels) => levels.flatMap((sources) => sources.map((source) => source.geometry)));
}

function disposeBakedGeometries(geometries: readonly THREE.BufferGeometry[]): void {
  for (const geometry of geometries) geometry.dispose();
}

/**
 * Bake a generator's variants at every detail in `bake.definition.lods` into draw sources: per variant,
 * per detail. A generator with a `prepare` step (a grown plant) prepares them off the frame first,
 * counted as scene loading under `work`; until then, and for no bake, there are none. Returns the
 * cancel for the in-flight prepare.
 */
function bakeGeneratorDraw(bake: GeneratorBake, work: string, onDone: (variants: ScatterModelSource[][][]) => void): () => void {
  let live = true;
  const bakeNow = (): ScatterModelSource[][][] => {
    const build = getGeneratorMesh(bake.definition.output);
    if (build === undefined) return [];
    return bakeGeneratorVariants(bake.definition, bake.base, bake.options).map((variant) => variant.lods.map((lod) => (build(lod.output) ?? []).map((source): ScatterModelSource => {
      if (source.geometry.boundingSphere === null) source.geometry.computeBoundingSphere();
      // Pebble-sized meshes cast no shadow: the map cannot resolve them, so they only draw a detached halo.
      const small = (source.geometry.boundingSphere?.radius ?? 1) < SMALL_SHADOW_RADIUS;
      return { ...source, localMatrix: IDENTITY, ...(small ? { skipShadow: true } : {}) };
    })));
  };
  if (bake.definition.prepare === undefined) {
    onDone(bakeNow());
    return () => {
      live = false;
    };
  }
  const done = trackSceneWork(work);
  prepareGeneratorVariants(bake.definition, bake.base, bake.options)
    .then(() => {
      if (live) onDone(bakeNow());
    })
    .catch((error: unknown) => console.error(`[jgengine] ${work} failed to prepare`, error))
    .finally(done);
  return () => {
    live = false;
  };
}

/**
 * A palette item grown by a generator: its variants are baked once, each turned into instanced draws
 * through the mesh builder registered for the generator's output, and every variant draws only the
 * placements assigned to it. Far away every variant draws one shared impostor baked from the first,
 * so more variants cost near draws, not atlas memory. A species too small for an impostor also bakes
 * the generator's coarser levels when the game sets `visibility.meshLods`, and each placement draws
 * the one its size on screen calls for. A unique species (`variants: "unique"`) also grows its near
 * placements one by one from their own seeds ({@link scatterHeroesDraw}) and hides their stand-ins once
 * each is ready.
 */
function scatterGeneratorSpeciesDraw({ item, species }: { item: string; species: ScatterGeneratorSpeciesDraw }): EngineDraw {
  const { definition, spec } = species;
  const key = `generator:${item}:${JSON.stringify(spec)}`;
  const detail = spec.detail ?? 1;
  const base = scatterGeneratorBase(spec, definition.schema);
  const options = {
    count: scatterGeneratorVariantCount(spec),
    explore: spec.explore ?? 0.3,
    seed: item,
    ...(spec.keep === undefined ? {} : { keep: spec.keep }),
  };
  const nearBake: GeneratorBake = { definition: { ...definition, lods: [detail] }, base, options };
  const unique = isUniqueScatterItem(spec);
  const instances = unique
    ? [...species.byVariant.values()].flatMap((batches) => batches.flatMap((batch) => batch.instances))
    : [];

  let state: EngineFrameState | null = null;
  let disposed = false;
  let nearReady = false;
  let near: ScatterModelSource[][][] = [];
  let far: ScatterModelSource[][][] = [];
  let coarser: ReturnType<typeof coarserScatterLevels> = [];
  let settings: ReturnType<typeof meshLodSettings> = null;
  let fields: EngineDraw[] = [];
  let heroesDraw: EngineDraw | null = null;
  let heroes: ReadonlySet<string> = NO_HEROES;
  let nearGeometries: THREE.BufferGeometry[] = [];
  let farGeometries: THREE.BufferGeometry[] = [];
  let cancelNear = () => {};
  let cancelFar = () => {};
  let lastGame: unknown = undefined;
  let lastFovKey = -1;
  let lastFieldKey = "";
  let lastCoarserKey = "";

  const rebuildFields = () => {
    const s = state;
    if (s === null || disposed) return;
    for (const field of fields) field.dispose?.(s);
    fields = [];
    if (!nearReady) return;
    const levels = near.map((nearLevels, variant): ScatterChunkLevel[] => {
      const own = nearLevels[0] ?? [];
      const farLevels = far[variant];
      if (farLevels === undefined) return withoutFarShadows([{ sources: own, maxDistance: Infinity }]);
      return withoutFarShadows([
        { sources: own, maxDistance: coarser[0]?.from ?? Infinity },
        ...coarser.map((_, index) => ({ sources: farLevels[index] ?? [], maxDistance: coarser[index + 1]?.from ?? Infinity })),
      ]);
    });
    const variantsSources = near.map((nearLevels) => nearLevels[0] ?? []);
    const hysteresis = settings?.hysteresis ?? DEFAULT_MESH_LOD_HYSTERESIS;
    const byVariant = heroes.size === 0
      ? species.byVariant
      : new Map([...species.byVariant].map(([variant, batches]) => [variant, hideScatterPlacements(batches, heroes)]));
    for (const [variant, batches] of byVariant) {
      const variantLevels = levels[variant];
      if (variantLevels === undefined || (variantLevels[0]?.sources.length ?? 0) === 0) continue;
      const field = scatterSourcesFieldDraw({ cacheKey: key, levels: variantLevels, farSources: variantsSources[0], batches, hysteresis });
      fields.push(field);
      field.mount?.(s);
    }
    if (unique && heroesDraw === null) {
      heroesDraw = scatterHeroesDraw(() => ({
        item,
        definition,
        spec,
        instances,
        onShown: (shown) => {
          heroes = shown;
          rebuildFields();
        },
      }));
      heroesDraw.mount?.(s);
    }
  };

  const syncLevels = (s: EngineFrameState) => {
    const game = currentMeshLodGame();
    const fovY = cameraFov(s.camera);
    const fovKey = Math.round(fovY * 1000);
    if (game === lastGame && fovKey === lastFovKey) return;
    lastGame = game;
    lastFovKey = fovKey;
    settings = meshLodSettings(game, undefined);
    const radius = sourceRadius(near[0]?.[0] ?? []);
    const nextCoarser = settings === null || radius <= 0 || radius >= IMPOSTOR_MIN_RADIUS
      ? []
      : coarserScatterLevels(detail, definition.lods, settings.screenSizes, radius, fovY);
    const hysteresis = settings?.hysteresis ?? DEFAULT_MESH_LOD_HYSTERESIS;
    const coarserKey = nextCoarser.map((level) => level.detail).join(",");
    const fieldKey = `${settings?.screenSizes.join(",") ?? "off"}|${hysteresis}|${coarserKey}`;
    if (fieldKey === lastFieldKey) return;
    const coarserChanged = coarserKey !== lastCoarserKey;
    lastFieldKey = fieldKey;
    lastCoarserKey = coarserKey;
    coarser = nextCoarser;
    if (!coarserChanged) {
      rebuildFields();
      return;
    }
    cancelFar();
    far = [];
    disposeBakedGeometries(farGeometries);
    farGeometries = [];
    if (nextCoarser.length === 0) {
      rebuildFields();
      return;
    }
    const farBake: GeneratorBake = { definition: { ...definition, lods: nextCoarser.map((level) => level.detail) }, base, options };
    cancelFar = bakeGeneratorDraw(farBake, `scatter-${item}-levels`, (variants) => {
      if (disposed) {
        disposeBakedGeometries(collectBakedGeometries(variants));
        return;
      }
      far = variants;
      farGeometries = collectBakedGeometries(variants);
      rebuildFields();
    });
  };

  return {
    priority: CAMERA_POST_FRAME_PRIORITY + 0.1,
    mount(s) {
      state = s;
      cancelNear = bakeGeneratorDraw(nearBake, `scatter-${item}`, (variants) => {
        if (disposed) {
          disposeBakedGeometries(collectBakedGeometries(variants));
          return;
        }
        near = variants;
        nearGeometries = collectBakedGeometries(variants);
        nearReady = true;
        rebuildFields();
      });
    },
    frame(s) {
      state = s;
      for (const field of fields) field.frame?.(s, s.delta);
      heroesDraw?.frame?.(s, s.delta);
      if (nearReady && !disposed) syncLevels(s);
    },
    update(s) {
      state = s;
      for (const field of fields) field.update?.(s);
      heroesDraw?.update?.(s);
    },
    dispose(s) {
      disposed = true;
      cancelNear();
      cancelFar();
      for (const field of fields) field.dispose?.(s);
      fields = [];
      heroesDraw?.dispose?.(s);
      heroesDraw = null;
      disposeBakedGeometries(nearGeometries);
      disposeBakedGeometries(farGeometries);
      nearGeometries = [];
      farGeometries = [];
      state = null;
    },
  };
}

/** The generator a palette item grows from: its mapping, else a registered generator whose id is the item and whose output draws as meshes. */
function generatorSpec(item: string, resolved: ModelConfig | ScatterGeneratorItem | null): ScatterGeneratorItem | null {
  if (resolved !== null) return isScatterGeneratorItem(resolved) ? resolved : null;
  const definition = getGenerator(item);
  return definition !== undefined && getGeneratorMesh(definition.output) !== undefined ? { generator: item } : null;
}

/** One species draw: the level switch for a model with `variants`, the single GLB otherwise. */
function scatterModelSpeciesDraw({ model, batches }: { model: ModelConfig; batches: ScatterBatch[] }): EngineDraw {
  return model.variants === undefined
    ? scatterSingleSpeciesDraw({ model, batches })
    : scatterVariantSpeciesDraw({ model, batches });
}

/** Props for {@link InstancedScatter}: the resolved instances plus chunking/instance-cap knobs. */
export interface InstancedScatterProps {
  instances: readonly ScatterInstance[];
  /** Chunk edge in meters; dense fields split into independently frustum-culled buckets. Default 24. */
  chunkSize?: number;
  /** Most instances drawn; past it the field thins evenly. Default 20000. */
  maxInstances?: number;
  /** Most chunks the field splits into; bigger fields get bigger chunks. Default 400. */
  maxChunks?: number;
  /**
   * Per-species override: return a real catalog `ModelConfig` for an item to GPU-instance the actual
   * GLB, or a {@link ScatterGeneratorItem} to grow it from a generator's baked variants. `null` (or
   * omitting the prop) grows an item named after a registered mesh generator (`"nature.rock"`) from
   * that generator, and draws anything else as the stylized `buildScatterProxy`.
   */
  resolveItem?: (item: string) => ModelConfig | ScatterGeneratorItem | null;
  /** Placement ids not drawn — felled trees, mined rocks ({@link ScatterClearing}). */
  hidden?: ReadonlySet<string>;
}

interface ScatterPipelineInputs {
  instances: readonly ScatterInstance[];
  hidden: ReadonlySet<string> | undefined;
  chunkSize: number;
  maxInstances: number;
  maxChunks: number;
  resolveItem: InstancedScatterProps["resolveItem"];
  resolutionKey: string;
}

/**
 * Renders resolved {@link ScatterInstance}s grouped into per-chunk, per-species GPU-instanced draws
 * that frustum-cull independently. Species with no `resolveItem` mapping (or a `null` result) render
 * as stylized proxy models (trunked trees, stacked pines, round bushes, faceted rocks, grass tufts);
 * species `resolveItem` resolves to a `ModelConfig` GPU-instance the real catalog GLB instead. The one
 * runtime foliage renderer shared by the editor's scatter preview and games that consume
 * `resolveScatter` — never one node per placement.
 */
export function instancedScatterDraw(getProps: () => InstancedScatterProps): EngineDraw {
  let children: EngineDraw[] = [];
  let geometries = new Map<string, THREE.BufferGeometry>();
  let last: ScatterPipelineInputs | null = null;

  const rebuild = (s: EngineFrameState, inputs: ScatterPipelineInputs) => {
    const capped = capScatterInstances(inputs.instances, inputs.maxInstances);
    const items = [...new Set(capped.map((instance) => instance.item))];
    const resolutions = items.map((item) => inputs.resolveItem?.(item) ?? null);
    const resolutionKey = JSON.stringify(resolutions);
    const byItem = new Map<string, ModelConfig | ScatterGeneratorItem | null>(items.map((item, index) => [item, resolutions[index] ?? null]));
    const generators = new Map<string, { definition: GeneratorDefinition; spec: ScatterGeneratorItem }>();
    for (const [item, result] of byItem) {
      const spec = generatorSpec(item, result);
      const definition = spec === null ? undefined : getGenerator(spec.generator);
      if (spec !== null && definition !== undefined) generators.set(item, { definition, spec });
    }
    const resolved = { byItem, generators };
    const assigned = resolved.generators.size === 0 ? capped : assignScatterVariants(capped, (item) => {
      const generator = resolved.generators.get(item);
      return generator === undefined ? undefined : scatterGeneratorVariantCount(generator.spec);
    });
    // The grid is sized from every placement, not the shown ones, so clearing a tree never re-chunks the field.
    const edge = scatterChunkSize(assigned, inputs.chunkSize, inputs.maxChunks);
    const allBatches = (() => {
      if (resolved.generators.size === 0) return scatterBatchInstances(assigned, edge);
      // A generator species splits into variants, each its own draw per chunk; a coarser grid for it
      // keeps its chunk-times-variant count near what one model species costs, since every chunk draw
      // is a scene node walked each frame.
      const plain: ScatterInstance[] = [];
      const grown = new Map<string, { variants: number; instances: ScatterInstance[] }>();
      for (const instance of assigned) {
        const tagged = parseScatterVariantItem(instance.item);
        const generator = tagged === null ? undefined : resolved.generators.get(tagged.item);
        if (tagged === null || generator === undefined) {
          plain.push(instance);
          continue;
        }
        const entry = grown.get(tagged.item) ?? { variants: scatterGeneratorVariantCount(generator.spec), instances: [] };
        entry.instances.push(instance);
        grown.set(tagged.item, entry);
      }
      const out = scatterBatchInstances(plain, edge);
      for (const { variants, instances } of grown.values()) out.push(...scatterBatchInstances(instances, edge * Math.sqrt(variants)));
      return out;
    })();
    const batches = hideScatterPlacements(allBatches, inputs.hidden);

    // Dev diagnostic (no-op unless armed): re-zero the scatter seam before re-tallying which species
    // fall to a stylized proxy (no resolveItem mapping / a null result). Reported once per species.
    beginFallbackSeam("scatter");
    const proxyBatches: ScatterBatch[] = [];
    const bySpecies = new Map<string, { model: ModelConfig; batches: ScatterBatch[] }>();
    const knownProxy = new Set<string>();
    const grown = new Map<string, ScatterGeneratorSpeciesDraw>();
    for (const batch of batches) {
      const tagged = parseScatterVariantItem(batch.item);
      const generator = tagged === null ? undefined : resolved.generators.get(tagged.item);
      if (tagged !== null && generator !== undefined) {
        const entry = grown.get(tagged.item) ?? { ...generator, byVariant: new Map<number, ScatterBatch[]>() };
        grown.set(tagged.item, entry);
        const list = entry.byVariant.get(tagged.variant);
        if (list === undefined) entry.byVariant.set(tagged.variant, [batch]);
        else list.push(batch);
        continue;
      }
      const species = bySpecies.get(batch.item);
      if (species !== undefined) {
        species.batches.push(batch);
        continue;
      }
      if (knownProxy.has(batch.item)) {
        proxyBatches.push(batch);
        continue;
      }
      const model = resolved.byItem.get(batch.item) ?? null;
      if (model === null || isScatterGeneratorItem(model)) {
        knownProxy.add(batch.item);
        reportFallbackSeam("scatter", "omittedMapping");
        proxyBatches.push(batch);
        continue;
      }
      bySpecies.set(batch.item, { model, batches: [batch] });
    }
    const nextGeometries = new Map<string, THREE.BufferGeometry>();
    for (const item of new Set(proxyBatches.map((batch) => batch.item))) {
      nextGeometries.set(item, buildScatterProxy(item));
    }
    const nextChildren: EngineDraw[] = [];
    for (const batch of proxyBatches) {
      const geometry = nextGeometries.get(batch.item);
      if (geometry !== undefined) nextChildren.push(scatterBatchMeshDraw(batch, geometry));
    }
    for (const [, species] of bySpecies) {
      nextChildren.push(scatterModelSpeciesDraw({ model: species.model, batches: species.batches }));
    }
    for (const [speciesItem, species] of grown) {
      nextChildren.push(scatterGeneratorSpeciesDraw({ item: speciesItem, species }));
    }

    for (const child of children) child.dispose?.(s);
    for (const geometry of geometries.values()) geometry.dispose();
    children = nextChildren;
    geometries = nextGeometries;
    for (const child of children) child.mount?.(s);
    last = { ...inputs, resolutionKey };
  };

  const sync = (s: EngineFrameState) => {
    const props = getProps();
    const inputs: ScatterPipelineInputs = {
      instances: props.instances,
      hidden: props.hidden,
      chunkSize: props.chunkSize ?? DEFAULT_CHUNK_SIZE,
      maxInstances: props.maxInstances ?? DEFAULT_MAX_INSTANCES,
      maxChunks: props.maxChunks ?? DEFAULT_MAX_CHUNKS,
      resolveItem: props.resolveItem,
      resolutionKey: "",
    };
    if (last !== null) {
      const pipelineSame = inputs.instances === last.instances
        && inputs.hidden === last.hidden
        && inputs.chunkSize === last.chunkSize
        && inputs.maxInstances === last.maxInstances
        && inputs.maxChunks === last.maxChunks;
      if (pipelineSame && inputs.resolveItem === last.resolveItem) return;
      if (pipelineSame) {
        // Asked every sync and keyed by what came back, not by the function: a game passes an inline
        // `resolveItem`, and keying on it rebuilt every species' draws, and relinked their shaders, on
        // each render of the game's world.
        const capped = capScatterInstances(inputs.instances, inputs.maxInstances);
        const items = [...new Set(capped.map((instance) => instance.item))];
        const resolutionKey = JSON.stringify(items.map((item) => inputs.resolveItem?.(item) ?? null));
        if (resolutionKey === last.resolutionKey) {
          last = { ...inputs, resolutionKey };
          return;
        }
      }
    }
    // The resolutions are computed inside rebuild; the key stands for them there.
    rebuild(s, inputs);
  };

  return {
    priority: CAMERA_POST_FRAME_PRIORITY + 0.1,
    mount(s) {
      sync(s);
    },
    update(s) {
      sync(s);
      for (const child of children) child.update?.(s);
    },
    frame(s) {
      for (const child of children) child.frame?.(s, s.delta);
    },
    dispose(s) {
      for (const child of children) child.dispose?.(s);
      children = [];
      for (const geometry of geometries.values()) geometry.dispose();
      geometries = new Map();
      last = null;
    },
  };
}

/**
 * Renders resolved {@link ScatterInstance}s grouped into per-chunk, per-species GPU-instanced draws
 * that frustum-cull independently. Species with no `resolveItem` mapping (or a `null` result) render
 * as stylized proxy models (trunked trees, stacked pines, round bushes, faceted rocks, grass tufts);
 * species `resolveItem` resolves to a `ModelConfig` GPU-instance the real catalog GLB instead. The one
 * runtime foliage renderer shared by the editor's scatter preview and games that consume
 * `resolveScatter` — never one node per placement.
 */
export function InstancedScatter(props: InstancedScatterProps) {
  const latest = useRef(props);
  latest.current = props;
  return <EngineDrawMount create={() => instancedScatterDraw(() => latest.current)} deps={[]} />;
}
