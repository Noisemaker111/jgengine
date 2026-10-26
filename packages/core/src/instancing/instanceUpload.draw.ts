import * as THREE from "three";

import { submitInstanceCount } from "@jgengine/shell/render/submittedDraws";

/** Instance transforms: a ready list of matrices, or a count plus a writer that fills each one. */
export type InstanceSource = readonly THREE.Matrix4[] | { count: number; at(index: number, out: THREE.Matrix4): void };

/** Per-instance tint: a ready list of colors, or a writer that fills each one. */
export type InstanceColors = readonly THREE.Color[] | ((index: number, out: THREE.Color) => void);

/** Knobs for {@link uploadInstances}. */
export interface InstanceUploadOptions {
  /** Applied after each instance matrix: a model part's own transform inside its source scene. */
  localMatrix?: THREE.Matrix4;
  /** Per-instance tint. The mesh gets an `instanceColor` buffer on first use. */
  colors?: InstanceColors;
  /**
   * How culling bounds follow the instances. Default `"sphere"`.
   * - `"sphere"`: recompute the mesh's bounding sphere from the instances.
   * - `"boxes"`: union every instance's transformed geometry box, padded by `boundsPad`, and wrap a
   *   sphere around it widened by √3 so a sheared parent still stays inside. Tight for tall or
   *   displaced geometry whose vertex box undersells it.
   * - a `Box3`: bounds already known, such as a spatial cell's.
   * - `"none"`: leave bounds alone, for draws that turn frustum culling off.
   */
  bounds?: "sphere" | "boxes" | "none" | THREE.Box3;
  /** Extra meters added around each instance's geometry box in `"boxes"` mode. Default 0. */
  boundsPad?: number;
  /** Mark the buffers for per-frame rewrites (`DynamicDrawUsage`). Default false. */
  dynamic?: boolean;
}

const scratchMatrix = new THREE.Matrix4();
const scratchColor = new THREE.Color();
const scratchBox = new THREE.Box3();

function growInstanceBuffers(mesh: THREE.InstancedMesh, count: number): void {
  const capacity = mesh.instanceMatrix.count;
  if (count <= capacity) return;
  const next = Math.max(count, capacity * 2);
  const usage = mesh.instanceMatrix.usage;
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(next * 16), 16);
  mesh.instanceMatrix.setUsage(usage);
  if (mesh.instanceColor !== null) {
    const colors = new THREE.InstancedBufferAttribute(new Float32Array(next * 3), 3);
    colors.setUsage(mesh.instanceColor.usage);
    mesh.instanceColor = colors;
  }
}

/**
 * Write a batch of instances into an `InstancedMesh`: transforms (with an optional model-local
 * matrix), optional colors, the draw count, the upload flags and the culling bounds. The buffers grow
 * when the batch outgrows them. Every instanced renderer in the engine draws through this, so counts
 * reach the draw probes and bounds stay right the same way everywhere.
 *
 * @capability instance-upload write transforms, colors, count and culling bounds into one instanced draw
 */
export function uploadInstances(mesh: THREE.InstancedMesh, source: InstanceSource, options: InstanceUploadOptions = {}): void {
  const list = Array.isArray(source) ? (source as readonly THREE.Matrix4[]) : null;
  const count = list === null ? (source as { count: number }).count : list.length;
  growInstanceBuffers(mesh, count);
  if (options.dynamic === true && mesh.instanceMatrix.usage !== THREE.DynamicDrawUsage) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const local = options.localMatrix;
  for (let index = 0; index < count; index += 1) {
    let matrix: THREE.Matrix4;
    if (list !== null) matrix = list[index]!;
    else {
      (source as { at(index: number, out: THREE.Matrix4): void }).at(index, scratchMatrix);
      matrix = scratchMatrix;
    }
    if (local !== undefined) matrix = (matrix === scratchMatrix ? matrix : scratchMatrix.copy(matrix)).multiply(local);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  const colors = options.colors;
  if (colors !== undefined) {
    for (let index = 0; index < count; index += 1) {
      if (typeof colors === "function") {
        colors(index, scratchColor);
        mesh.setColorAt(index, scratchColor);
      } else mesh.setColorAt(index, colors[index]!);
    }
    if (mesh.instanceColor !== null) {
      if (options.dynamic === true && mesh.instanceColor.usage !== THREE.DynamicDrawUsage) mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.needsUpdate = true;
    }
  }
  submitInstanceCount(mesh, count);
  const bounds = options.bounds ?? "sphere";
  if (bounds === "none" || count === 0) return;
  if (bounds === "sphere") {
    mesh.computeBoundingSphere();
    return;
  }
  if (bounds instanceof THREE.Box3) {
    mesh.boundingBox = bounds.clone();
    mesh.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    return;
  }
  if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
  const geometryBox = mesh.geometry.boundingBox!.clone().expandByScalar(options.boundsPad ?? 0);
  const union = new THREE.Box3();
  for (let index = 0; index < count; index += 1) {
    mesh.getMatrixAt(index, scratchMatrix);
    union.union(scratchBox.copy(geometryBox).applyMatrix4(scratchMatrix));
  }
  mesh.boundingBox = union;
  mesh.boundingSphere = union.getBoundingSphere(new THREE.Sphere());
  // Three scales spheres by the longest matrix column; √3 also encloses a sheared parent.
  mesh.boundingSphere.radius *= Math.sqrt(3);
}

/** Compose one instance matrix from a position, Euler rotation (radians) and scale into `out`. */
export function composeInstance(
  out: THREE.Matrix4,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] | undefined,
  scale: number | readonly [number, number, number],
): THREE.Matrix4 {
  composePosition.set(position[0], position[1], position[2]);
  composeEuler.set(rotation?.[0] ?? 0, rotation?.[1] ?? 0, rotation?.[2] ?? 0);
  composeQuaternion.setFromEuler(composeEuler);
  if (typeof scale === "number") composeScale.setScalar(scale);
  else composeScale.set(scale[0], scale[1], scale[2]);
  return out.compose(composePosition, composeQuaternion, composeScale);
}

const composePosition = new THREE.Vector3();
const composeEuler = new THREE.Euler();
const composeQuaternion = new THREE.Quaternion();
const composeScale = new THREE.Vector3();
