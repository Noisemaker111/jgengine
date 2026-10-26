import * as THREE from "three";
import type { ModelConfig, ObjectStyle } from "@jgengine/core/game/playableGame";
import { objectVisualScale, type SceneObject } from "@jgengine/core/scene/objectStore";
import type { GameContextObjectEntry } from "@jgengine/core/runtime/gameContext";
import { buildScatterModelSources, type ScatterModelSource } from "@jgengine/core/scatter/scatterModels.draw";
import { POINTER_OBJECT_INSTANCES_KEY } from "@jgengine/core/input/pointerService.draw";
import { submitInstanceCount, submitsDraw } from "@jgengine/core/render/submittedDraws.draw";

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
  return model !== undefined &&
    scaleOnlyVisual(object.visual) && object.state === undefined && object.slots === undefined &&
    catalog?.proximityPrompt === undefined && (catalog?.verbs?.length ?? 0) === 0 &&
    (catalog?.breakable === undefined || catalog.breakable === false) && catalog?.slotInventory === undefined &&
    (object.animation === undefined ? isStaticModelCached(model) : isStaticModel(model, object.animation));
}

/** Every batch source asks this of every member every frame; a model's answer never changes. */
const staticModels = new WeakMap<ModelConfig, boolean>();

function isStaticModelCached(model: ModelConfig): boolean {
  let known = staticModels.get(model);
  if (known === undefined) {
    known = isStaticModel(model, model.animation);
    staticModels.set(model, known);
  }
  return known;
}

/**
 * A model a batch can draw: nothing that moves or retextures one placement on its own, and parts that
 * are fixed kit pieces (no motion `role`) of models that pass the same test. A composed model with
 * detail levels stays on the individual renderer, which switches its parts with it.
 */
function isStaticModel(model: ModelConfig, animation: SceneObject["animation"] | ModelConfig["animation"]): boolean {
  const parts = model.parts ?? [];
  return (animation === undefined || animation === "auto" || animation === "none") && (model.ik === undefined || model.ik === "none") &&
    (model.scale ?? 1) >= 0 && (model.attachments?.length ?? 0) === 0 &&
    model.partMotion === undefined && model.surfaceDetail !== false && model.material?.maps === undefined && (model.materialAssignments?.length ?? 0) === 0 &&
    (model.hiddenNodes === undefined || (Array.isArray(model.hiddenNodes) && model.hiddenNodes.length === 0)) &&
    (parts.length === 0 || (model.variants === undefined && parts.every((part) => part.role === undefined && (part.scale ?? 1) > 0 &&
      (typeof part.model === "string" || (part.model.variants === undefined && isStaticModel(part.model, part.model.animation))))));
}

/** One model of a composed placement, and where its part offsets put it under the placement. @internal */
export interface StaticModelPiece {
  model: ModelConfig;
  matrix: THREE.Matrix4;
}

/**
 * Flatten a model and its kit parts into the pieces a batch draws, each with the offset the
 * individual renderer gives it: a part sits at its position, rotation and uniform scale under its
 * parent part, and a parent's own `scale` sizes only its mesh. A part still named by catalog id
 * draws nothing on either path.
 * @internal
 */
export function staticModelPieces(model: ModelConfig): StaticModelPiece[] {
  const pieces: StaticModelPiece[] = [];
  const visit = (piece: ModelConfig, matrix: THREE.Matrix4) => {
    const { parts, ...own } = piece;
    pieces.push({ model: parts === undefined ? piece : own, matrix });
    for (const part of parts ?? []) {
      if (typeof part.model === "string") continue;
      const scale = part.scale ?? 1;
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(...(part.position ?? [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
        new THREE.Vector3(scale, scale, scale),
      );
      visit(part.model, matrix.clone().multiply(local));
    }
  };
  visit(model, new THREE.Matrix4());
  return pieces;
}

/** A placement visual a batch can draw: none, or only a per-instance scale folded into its matrix. */
function scaleOnlyVisual(visual: SceneObject["visual"]): boolean {
  if (visual === undefined) return true;
  return visual.color === undefined && visual.opacity === undefined && objectVisualScale(visual).every((axis) => axis > 0);
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

/**
 * Batch cell edge in metres. One InstancedMesh has one bounding sphere, and three frustum-tests it in
 * the shadow pass too, so a batch that spans the whole city submits every camera-visible instance to
 * every shadow cascade. A cell keeps that test useful without fragmenting one model per prop.
 * @internal
 */
export const STATIC_BATCH_CELL = 128;

/** Smallest same-model group a cell batches on its own. @internal */
export const STATIC_BATCH_MIN = 2;

/**
 * Groups compatible authored or `scenery` props by model inside {@link STATIC_BATCH_CELL} metres, at
 * least {@link STATIC_BATCH_MIN} of a model to a cell. Culling stays per instance:
 * `syncStaticObjectSource` compacts each batch's drawn range against the visibility predicate every
 * frame, and the cell keeps the batch's one bounding sphere small enough that three's own frustum
 * test still rejects it in the shadow pass.
 *
 * A prop left alone in its cell joins the nearest batch of its model, and a model with no cell batch
 * gathers its lone props into one: drawn on its own it would link a second, non-instanced program
 * for every material the instanced copies already linked. Only a model placed once in the whole
 * world, or a prop a batch cannot draw, comes back in `singles`.
 * @internal
 */
export function groupStaticObjects(candidates: readonly StaticObjectCandidate[], previous?: ReadonlyMap<string, StaticObjectBatch>, cell = STATIC_BATCH_CELL): {
  batches: StaticObjectBatch[];
  singles: StaticObjectCandidate[];
} {
  const models = new Map<string, { model: ModelConfig; cells: Map<string, { center: readonly [number, number]; members: StaticObjectCandidate[] }> }>();
  const singles: StaticObjectCandidate[] = [];
  for (const candidate of candidates) {
    const { object, model } = candidate;
    if (model === undefined || !canBatchStaticObject(candidate)) {
      singles.push(candidate);
      continue;
    }
    const modelKey = JSON.stringify([object.catalogId, model]);
    let entry = models.get(modelKey);
    if (entry === undefined) {
      entry = { model, cells: new Map() };
      models.set(modelKey, entry);
    }
    const cellX = Math.floor(object.position[0] / cell);
    const cellZ = Math.floor(object.position[2] / cell);
    const cellKey = JSON.stringify([object.catalogId, cellX, cellZ, model]);
    let members = entry.cells.get(cellKey);
    if (members === undefined) {
      members = { center: [(cellX + 0.5) * cell, (cellZ + 0.5) * cell], members: [] };
      entry.cells.set(cellKey, members);
    }
    members.members.push(candidate);
  }
  const batches: StaticObjectBatch[] = [];
  const placed = previous === undefined ? null : new Set(candidates.map((candidate) => candidate.object.instanceId));
  const keep = (batch: StaticObjectBatch) => {
    const cached = previous?.get(batch.key);
    batches.push(cached !== undefined && placed !== null && keepsCachedBatch(cached, batch, placed) ? cached : batch);
  };
  for (const { model, cells } of models.values()) {
    const full: { batch: StaticObjectBatch; center: readonly [number, number] }[] = [];
    const lone: StaticObjectCandidate[] = [];
    for (const [key, { center, members }] of cells) {
      if (members.length >= STATIC_BATCH_MIN) full.push({ batch: { key, model, objects: members.map((member) => member.object) }, center });
      else lone.push(...members);
    }
    if (full.length === 0) {
      if (lone.length >= STATIC_BATCH_MIN) keep({ key: JSON.stringify([lone[0]!.object.catalogId, "lone", model]), model, objects: lone.map((member) => member.object) });
      else singles.push(...lone);
      continue;
    }
    for (const { object } of lone) {
      let nearest = full[0]!;
      let best = Number.POSITIVE_INFINITY;
      for (const option of full) {
        const distance = Math.hypot(option.center[0] - object.position[0], option.center[1] - object.position[2]);
        if (distance < best) {
          best = distance;
          nearest = option;
        }
      }
      nearest.batch.objects.push(object);
    }
    for (const { batch } of full) keep(batch);
  }
  return { batches, singles };
}

/**
 * Whether a regrouped batch can keep the one already drawn: the same members, or the same less some
 * that left the scene. A removed member already draws nothing (the per-frame sync skips a placement
 * it cannot find), so keeping its slot spares the batch a rebuild each time a prop is cleared away.
 * A member that is still placed but grouped elsewhere forces the new batch, or it would draw twice.
 */
function keepsCachedBatch(cached: StaticObjectBatch, batch: StaticObjectBatch, placed: ReadonlySet<string>): boolean {
  if (batch.objects.length > cached.objects.length) return false;
  const members = new Set(batch.objects.map((object) => object.instanceId));
  let kept = 0;
  for (const object of cached.objects) {
    if (members.has(object.instanceId)) kept += 1;
    else if (placed.has(object.instanceId)) return false;
  }
  return kept === batch.objects.length;
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

/**
 * Harvest every piece of a model into batch sources, each carried to its part offset. Null when any
 * piece's loaded scene cannot be instanced, so the whole placement stays on the individual renderer.
 * @internal
 */
export function harvestStaticPieces(
  pieces: readonly StaticModelPiece[],
  gltfs: readonly { scene: THREE.Object3D; animations: THREE.AnimationClip[] }[],
): { sources: ScatterModelSource[]; roots: THREE.Object3D[] } | null {
  if (!gltfs.every((gltf) => canInstanceStaticScene(gltf.scene, gltf.animations))) return null;
  const sources: ScatterModelSource[] = [];
  const roots: THREE.Object3D[] = [];
  pieces.forEach((piece, index) => {
    const harvested = buildScatterModelSources(gltfs[index]!.scene, piece.model);
    roots.push(harvested.root);
    for (const source of harvested.sources) sources.push({ ...source, localMatrix: piece.matrix.clone().multiply(source.localMatrix) });
  });
  return { sources, roots };
}

/**
 * The live placements a batch draws this frame: found, visible and, with `accept`, on one detail level
 * of a variant model. Gathered once per batch and shared by every source of its model, so a composed
 * model's many draws do not each re-check every member. Fills and returns `into`. @internal
 */
export function gatherStaticMembers(
  objects: readonly SceneObject[],
  get: (id: string) => SceneObject | null,
  visible: (id: string) => boolean,
  accept?: (live: SceneObject) => boolean,
  into: SceneObject[] = [],
): SceneObject[] {
  let count = 0;
  for (const object of objects) {
    const live = get(object.instanceId);
    if (live === null || !visible(live.instanceId) || (accept !== undefined && !accept(live))) continue;
    into[count++] = live;
  }
  into.length = count;
  return into;
}

/** Write the gathered placements into one source's instances and picking identities without allocating per instance. @internal */
export function syncStaticObjectSource(
  mesh: THREE.InstancedMesh,
  source: ScatterModelSource,
  members: readonly SceneObject[],
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
  for (const live of members) {
    if (poses[count] === live) {
      ids[count++] = live.instanceId;
      continue;
    }
    scratch.position.fromArray(live.position);
    scratch.rotation.set(0, live.rotationY, 0);
    scratch.scale.fromArray(objectVisualScale(live.visual));
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
