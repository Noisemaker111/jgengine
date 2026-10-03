import * as THREE from "three";
import type { ModelConfig, ObjectStyle } from "@jgengine/core/game/playableGame";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";
import type { ScatterModelSource } from "../scatter/scatterModels";
import { POINTER_OBJECT_INSTANCES_KEY } from "../pointer/pointerService";

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
  return candidate.authored && !candidate.custom && candidate.style === undefined &&
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
    model.partMotion === undefined && model.material?.maps === undefined && (model.materialAssignments?.length ?? 0) === 0;
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

/** Groups compatible authored props above eight placements per spatial cell. @internal */
export function groupStaticObjects(candidates: readonly StaticObjectCandidate[], chunkSize = 24, previous?: ReadonlyMap<string, StaticObjectBatch>): {
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
    const key = JSON.stringify([object.catalogId, Math.floor(object.position[0] / chunkSize), Math.floor(object.position[2] / chunkSize), model]);
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
    if (batch.objects.length > 8) {
      const cached = previous?.get(batch.key);
      batches.push(cached !== undefined && cached.objects.length === batch.objects.length &&
        cached.objects.every((object, index) => object.instanceId === batch.objects[index]!.instanceId) ? cached : batch);
    }
    else singles.push(...members);
  }
  return { batches, singles };
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

/** Compact visible placements and update picking identities without allocating per instance. @internal */
export function syncStaticObjectSource(
  mesh: THREE.InstancedMesh,
  source: ScatterModelSource,
  objects: readonly SceneObject[],
  get: (id: string) => SceneObject | null,
  visible: (id: string) => boolean,
  scratch: THREE.Object3D,
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
    if (live === null || !visible(live.instanceId)) continue;
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
  mesh.count = count;
  mesh.visible = count > 0;
  if (changed) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
}
