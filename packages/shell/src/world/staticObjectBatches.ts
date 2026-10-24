import * as THREE from "three";
import type { ModelConfig, ObjectStyle } from "@jgengine/core/game/playableGame";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";
import type { ScatterModelSource } from "../scatter/scatterModels";
import { POINTER_OBJECT_INSTANCES_KEY } from "../pointer/pointerService";
import { submitInstanceCount, submitsDraw } from "../render/submittedDraws";

/** @internal */
export interface StaticObjectCandidate {
  object: SceneObject;
  model?: ModelConfig;
  authored: boolean;
  custom: boolean;
  catalog: GameContextObjectEntry | null;
  style?: ObjectStyle | undefined;
}

/** @internal */
export interface StaticObjectBatch {
  key: string;
  model: ModelConfig;
  objects: SceneObject[];
}

/** The same compatibility gate is used when live placements change after grouping. @internal */
export function canBatchStaticObject(candidate: StaticObjectCandidate): boolean {
  const { object, model, catalog } = candidate;
  return (candidate.authored || catalog?.scenery === true) && !candidate.custom && candidate.style === undefined &&
    isCompatibleStaticObject(object, model, catalog);
}

/** Checks a live placement without constructing a grouping candidate. @internal */
export function isCompatibleStaticObject(object: SceneObject, model: ModelConfig | undefined, catalog: GameContextObjectEntry | null): boolean {
  const animation = object.animation ?? model?.animation;
  return model !== undefined &&
    object.visual === undefined && object.state === undefined && object.slots === undefined &&
    catalog?.proximityPrompt === undefined && (catalog?.verbs?.length ?? 0) === 0 &&
    (catalog?.breakable === undefined || catalog.breakable === false) && catalog?.slotInventory === undefined &&
    (animation === undefined || animation === "auto" || animation === "none") && model.ik === undefined &&
    (model.scale ?? 1) >= 0 && (model.parts?.length ?? 0) === 0 && (model.attachments?.length ?? 0) === 0 &&
    model.partMotion === undefined && model.surfaceDetail !== false && model.material?.maps === undefined && (model.materialAssignments?.length ?? 0) === 0 &&
    (model.hiddenNodes === undefined || (Array.isArray(model.hiddenNodes) && model.hiddenNodes.length === 0));
}

/** Stable exclusion snapshot; only compatibility transitions allocate. @internal */
export function incompatibleStaticObjectIds(
  batch: StaticObjectBatch,
  get: (id: string) => SceneObject | null,
  catalog: (id: string) => GameContextObjectEntry | null,
  previous: readonly string[],
  fallbackObjects?: Map<string, SceneObject>,
): readonly string[] {
  const compatible = (object: SceneObject) => object.catalogId === batch.objects[0]!.catalogId &&
    isCompatibleStaticObject(object, batch.model, catalog(object.instanceId));
  let count = 0;
  let changed = false;
  for (const object of batch.objects) {
    const live = get(object.instanceId);
    if (live !== null && !compatible(live)) {
      changed ||= previous[count] !== live.instanceId;
      const before = fallbackObjects?.get(live.instanceId);
      if (before !== undefined) changed ||= before.catalogId !== live.catalogId || before.animation !== live.animation ||
        before.visual !== live.visual || before.state !== live.state || before.slots !== live.slots;
      fallbackObjects?.set(live.instanceId, live);
      count++;
    }
  }
  if (fallbackObjects !== undefined) for (const id of fallbackObjects.keys()) {
    const live = get(id);
    if (live === null || compatible(live)) fallbackObjects.delete(id);
  }
  if (!changed && count === previous.length) return previous;
  return batch.objects.flatMap((object) => {
    const live = get(object.instanceId);
    return live !== null && !compatible(live) ? [live.instanceId] : [];
  });
}

/** Smallest same-model group worth an instanced draw; below this each prop draws on its own. @internal */
export const STATIC_BATCH_MIN = 2;

/**
 * Batch cell edge in metres. One InstancedMesh has one bounding sphere, and three frustum-tests it in
 * the shadow pass too, so a batch that spans the whole city submits every camera-visible instance to
 * every shadow cascade. A cell keeps that test useful without fragmenting one model per prop.
 * @internal
 */
export const STATIC_BATCH_CELL = 128;

/**
 * Groups compatible authored or `scenery` props by model inside {@link STATIC_BATCH_CELL} metres, at
 * least {@link STATIC_BATCH_MIN} of a model. Culling stays per instance: `syncStaticObjectSource`
 * compacts each batch's drawn range against the visibility predicate every frame, and the cell keeps
 * the batch's one bounding sphere small enough that three's own frustum test still rejects it in the
 * shadow pass. Props spread thinner than the minimum in a cell fall back to individual draws.
 * @internal
 */
export function groupStaticObjects(candidates: readonly StaticObjectCandidate[], previous?: ReadonlyMap<string, StaticObjectBatch>, cell = STATIC_BATCH_CELL): {
  batches: StaticObjectBatch[];
  singles: StaticObjectCandidate[];
} {
  const groups = new Map<string, { batch: StaticObjectBatch; candidates: StaticObjectCandidate[] }>();
  const singles: StaticObjectCandidate[] = [];
  for (const candidate of candidates) {
    const { object, model } = candidate;
    if (model === undefined || !canBatchStaticObject(candidate)) {
      singles.push(candidate);
      continue;
    }
    const key = JSON.stringify([object.catalogId, Math.floor(object.position[0] / cell), Math.floor(object.position[2] / cell), model]);
    let group = groups.get(key);
    if (group === undefined) {
      group = { batch: { key, model, objects: [] }, candidates: [] };
      groups.set(key, group);
    }
    group.batch.objects.push(object);
    group.candidates.push(candidate);
  }
  const batches: StaticObjectBatch[] = [];
  for (const { batch, candidates: members } of groups.values()) {
    if (batch.objects.length >= STATIC_BATCH_MIN) {
      const cached = previous?.get(batch.key);
      batches.push(cached !== undefined && cached.objects.length === batch.objects.length &&
        cached.objects.every((object, index) => object.instanceId === batch.objects[index]!.instanceId) ? cached : batch);
    }
    else singles.push(...members);
  }
  return { batches, singles };
}

/** Marks the instanced draws a static object batch owns so the batching probe can count them. @internal */
export const STATIC_BATCH_MESH_KEY = "jgStaticObjectBatch";

/** What one frame's static object batching produced. @internal */
export interface StaticBatchCounts {
  /** Instanced draws the loaded models actually submitted. */
  draws: number;
  /** Distinct instances inside those draws after the visibility predicate compacted them. */
  drawn: number;
}

/**
 * Sum the tagged draws the batches actually submit. `drawn` counts each instance once even though one
 * instance appears in every material source's draw, so it is the number of instances the renderer was
 * asked to draw this frame — a world-wide batch whose instances leave the view drops it without
 * unmounting. A variant level with no instance in a cell, or a cell the camera culled, submits nothing
 * and is not a draw.
 * @internal
 */
export function countStaticBatchDraws(scene: THREE.Object3D): StaticBatchCounts {
  let draws = 0;
  const drawn = new Set<string>();
  scene.traverse((node) => {
    if (node.userData[STATIC_BATCH_MESH_KEY] !== true || !submitsDraw(node)) return;
    draws += 1;
    const ids = node.userData[POINTER_OBJECT_INSTANCES_KEY];
    if (Array.isArray(ids)) for (const id of ids as string[]) drawn.add(id);
  });
  return { draws, drawn: drawn.size };
}

/** Rejects loaded scenes whose behavior cannot be represented by static instanced draws. @internal */
export function canInstanceStaticScene(scene: THREE.Object3D, clips: readonly THREE.AnimationClip[]): boolean {
  if (clips.length > 0) return false;
  scene.updateMatrixWorld(true);
  if (!scene.matrix.equals(new THREE.Matrix4())) return false;
  let supported = true;
  scene.traverse((node) => {
    if (node.layers.mask !== 1 || node.renderOrder !== 0 || node.matrix.determinant() < 0) supported = false;
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) {
      if (!(node as THREE.Group).isGroup && node.type !== "Object3D" && node.type !== "Scene") supported = false;
      return;
    }
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh ||
      mesh.morphTargetInfluences !== undefined || mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
      mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender) supported = false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some((material) => material.transparent || (material as THREE.ShaderMaterial).isShaderMaterial)) supported = false;
    const elements = mesh.matrixWorld.elements;
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
      const dot = elements[a * 4]! * elements[b * 4]! + elements[a * 4 + 1]! * elements[b * 4 + 1]! + elements[a * 4 + 2]! * elements[b * 4 + 2]!;
      const lengthA = Math.hypot(elements[a * 4]!, elements[a * 4 + 1]!, elements[a * 4 + 2]!);
      const lengthB = Math.hypot(elements[b * 4]!, elements[b * 4 + 1]!, elements[b * 4 + 2]!);
      // Three's instanced normal transform assumes orthogonal matrix columns.
      if (Math.abs(dot) > 1e-5 * lengthA * lengthB) supported = false;
    }
  });
  return supported;
}

/** Compact visible placements and update picking identities without allocating per instance. `accept` narrows the range to one detail level of a variant model. @internal */
export function syncStaticObjectSource(
  mesh: THREE.InstancedMesh,
  source: ScatterModelSource,
  objects: readonly SceneObject[],
  get: (id: string) => SceneObject | null,
  visible: (id: string) => boolean,
  scratch: THREE.Object3D,
  accept?: (live: SceneObject) => boolean,
): void {
  const ids = (mesh.userData[POINTER_OBJECT_INSTANCES_KEY] ??= []) as string[];
  const poses = (mesh.userData["jgStaticObjectPoses"] ??= []) as SceneObject[];
  if (mesh.userData["jgStaticObjectSource"] !== source) {
    poses.length = 0;
    mesh.userData["jgStaticObjectSource"] = source;
  }
  let count = 0;
  let changed = false;
  const composed = scratch.matrixWorld;
  for (const object of objects) {
    const live = get(object.instanceId);
    if (live === null || !visible(live.instanceId) || (accept !== undefined && !accept(live))) continue;
    if (poses[count] === live) {
      ids[count++] = live.instanceId;
      continue;
    }
    scratch.position.fromArray(live.position);
    scratch.rotation.set(0, live.rotationY, 0);
    scratch.updateMatrix();
    composed.multiplyMatrices(scratch.matrix, source.localMatrix);
    const offset = count * 16;
    for (let axis = 0; axis < 16; axis += 1) {
      if (mesh.instanceMatrix.array[offset + axis] !== Math.fround(composed.elements[axis]!)) { changed = true; break; }
    }
    mesh.setMatrixAt(count, composed);
    poses[count] = live;
    ids[count++] = live.instanceId;
  }
  ids.length = count;
  poses.length = count;
  changed ||= mesh.count !== count;
  submitInstanceCount(mesh, count);
  if (changed) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}
