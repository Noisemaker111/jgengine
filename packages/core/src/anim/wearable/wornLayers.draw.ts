// @skill jgengine-world
import { useEffect } from "react";
import * as THREE from "three";

import { applyMaterialOverrideToMaterial } from "../../material/materialOverride.draw";
import { bodyFrame, boneSlots, wornRegion, wornThickness, wornTriangles, type BodyFrame, type WornLayer } from "./wornRegion";
import type { SkeletonSlot } from "../skeletonStandard";

/** `userData` flag on every worn shell, so a second layer never shells a shell. */
const WORN_SHELL = "jgWornShell";
/** Undyed plant fibre, for a layer that names no colour. */
const FIBRE = "#9c8462";

interface SkinRead {
  slots: (SkeletonSlot | null)[];
  frame: BodyFrame;
  /** Bind-space units per unit of the mesh's own geometry. */
  bindScale: number;
}

const skinReads = new WeakMap<THREE.BufferGeometry, SkinRead | null>();
const shellGeometries = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry | null>>();

const scratch = new THREE.Vector3();
const scratchMatrix = new THREE.Matrix4();

/** Bind-space position of the bone that fills `slot` itself (the topmost bone of that slot). */
function bonePosition(mesh: THREE.SkinnedMesh, slots: readonly (SkeletonSlot | null)[], parents: readonly number[], slot: SkeletonSlot): number[] | null {
  const index = slots.findIndex((own, at) => own === slot && slots[parents[at] ?? -1] !== slot);
  const inverse = mesh.skeleton.boneInverses[index];
  if (inverse === undefined) return null;
  scratch.setFromMatrixPosition(scratchMatrix.copy(inverse).invert());
  return [scratch.x, scratch.y, scratch.z];
}

/** Each bone's slot, and where the body stands in the skin's bind space; `null` for a skin that is not a humanoid. */
function readSkin(mesh: THREE.SkinnedMesh): SkinRead | null {
  const cached = skinReads.get(mesh.geometry);
  if (cached !== undefined) return cached;
  const bones = mesh.skeleton.bones;
  const at = new Map<THREE.Object3D, number>(bones.map((bone, index) => [bone, index]));
  const parents = bones.map((bone) => (bone.parent === null ? -1 : at.get(bone.parent) ?? -1));
  const slots = boneSlots(bones.map((bone, index) => ({ name: bone.name, parent: parents[index] ?? -1 })));
  const head = bonePosition(mesh, slots, parents, "head");
  const footL = bonePosition(mesh, slots, parents, "foot.l");
  const footR = bonePosition(mesh, slots, parents, "foot.r");
  const frame = head === null || footL === null || footR === null ? null : bodyFrame(head, footL, footR);
  const read = frame === null ? null : { slots, frame, bindScale: mesh.bindMatrix.getMaxScaleOnAxis() };
  skinReads.set(mesh.geometry, read);
  return read;
}

function bindPositions(mesh: THREE.SkinnedMesh): Float32Array {
  const position = mesh.geometry.getAttribute("position");
  const out = new Float32Array(position.count * 3);
  for (let v = 0; v < position.count; v++) {
    scratch.fromBufferAttribute(position, v).applyMatrix4(mesh.bindMatrix);
    out[v * 3] = scratch.x;
    out[v * 3 + 1] = scratch.y;
    out[v * 3 + 2] = scratch.z;
  }
  return out;
}

/**
 * The shell a layer cuts from one skinned mesh: the region's triangles, each vertex pushed out along
 * its normal, sharing the source's normals, UVs and skin weights. Shared by every instance of the
 * same source geometry, so a crowd in the same clothes builds it once. `null` when the region misses it.
 */
function shellGeometry(mesh: THREE.SkinnedMesh, layer: WornLayer): THREE.BufferGeometry | null {
  const read = readSkin(mesh);
  if (read === null) return null;
  const region = wornRegion(layer);
  const thickness = wornThickness(layer);
  const key = `${JSON.stringify(region)}|${thickness}`;
  let byKey = shellGeometries.get(mesh.geometry);
  if (byKey === undefined) {
    byKey = new Map();
    shellGeometries.set(mesh.geometry, byKey);
  }
  const cached = byKey.get(key);
  if (cached !== undefined) return cached;
  const source = mesh.geometry;
  const skinIndex = source.getAttribute("skinIndex");
  const skinWeight = source.getAttribute("skinWeight");
  const position = source.getAttribute("position");
  let shell: THREE.BufferGeometry | null = null;
  if (skinIndex !== undefined && skinWeight !== undefined && position !== undefined) {
    const indexValues = source.index?.array ?? null;
    const triangles = wornTriangles(
      { positions: bindPositions(mesh), skinIndex: attributeValues(skinIndex), skinWeight: attributeValues(skinWeight), index: indexValues },
      read.slots,
      read.frame,
      region,
    );
    if (triangles.length > 0) shell = buildShell(source, triangles, (thickness * read.frame.span) / read.bindScale);
  }
  byKey.set(key, shell);
  return shell;
}

function attributeValues(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const out = new Float32Array(attribute.count * 4);
  for (let v = 0; v < attribute.count; v++) {
    out[v * 4] = attribute.getX(v);
    out[v * 4 + 1] = attribute.getY(v);
    out[v * 4 + 2] = attribute.getZ(v);
    out[v * 4 + 3] = attribute.getW(v);
  }
  return out;
}

function buildShell(source: THREE.BufferGeometry, triangles: Uint32Array, offset: number): THREE.BufferGeometry {
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const pushed = new Float32Array(position.count * 3);
  const along = new THREE.Vector3();
  for (let v = 0; v < position.count; v++) {
    scratch.fromBufferAttribute(position, v);
    if (normal !== undefined) scratch.addScaledVector(along.fromBufferAttribute(normal, v).normalize(), offset);
    pushed[v * 3] = scratch.x;
    pushed[v * 3 + 1] = scratch.y;
    pushed[v * 3 + 2] = scratch.z;
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute("position", new THREE.BufferAttribute(pushed, 3));
  for (const name of ["normal", "uv", "skinIndex", "skinWeight"]) {
    const attribute = source.getAttribute(name);
    if (attribute !== undefined) shell.setAttribute(name, attribute);
  }
  shell.setIndex(new THREE.BufferAttribute(triangles, 1));
  return shell;
}

function isSkinnedMesh(node: THREE.Object3D): node is THREE.SkinnedMesh {
  return "isSkinnedMesh" in node && node.isSkinnedMesh === true;
}

/** A shell never covers glass, hair cards or lashes: only fully opaque surfaces. */
function opaque(mesh: THREE.SkinnedMesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every((material) => !material.transparent && material.alphaTest === 0 && !("alphaMap" in material && material.alphaMap != null));
}

function layerMaterial(layer: WornLayer): THREE.Material {
  const base = new THREE.MeshStandardMaterial({ color: FIBRE, roughness: 0.95, metalness: 0 });
  base.name = "worn";
  return layer.material === undefined ? base : applyMaterialOverrideToMaterial(base, layer.material, false, undefined);
}

/**
 * Dress a rigged humanoid in one worn layer: every opaque skinned mesh under `rig` gets a shell of the
 * layer's region, bound to that mesh's own skeleton, so the piece bends with every clip, IK pass and
 * folded first-person head. Returns the undo, which takes the shells off and frees their material.
 * A rig the humanoid standard cannot read wears nothing.
 *
 * @capability worn-layers draw clothing on a rigged human by body area, skinned to its skeleton
 */
export function attachWornLayer(rig: THREE.Object3D, layer: WornLayer): () => void {
  const sources: THREE.SkinnedMesh[] = [];
  rig.traverse((node) => {
    if (isSkinnedMesh(node) && node.userData[WORN_SHELL] !== true && opaque(node)) sources.push(node);
  });
  const material = layerMaterial(layer);
  const shells: THREE.SkinnedMesh[] = [];
  for (const source of sources) {
    const geometry = shellGeometry(source, layer);
    if (geometry === null) continue;
    const shell = new THREE.SkinnedMesh(geometry, material);
    shell.name = `${source.name}.worn`;
    shell.userData[WORN_SHELL] = true;
    shell.castShadow = source.castShadow;
    shell.receiveShadow = source.receiveShadow;
    shell.frustumCulled = source.frustumCulled;
    shell.bind(source.skeleton, source.bindMatrix);
    source.add(shell);
    shells.push(shell);
  }
  return () => {
    for (const shell of shells) shell.removeFromParent();
    material.dispose();
  };
}

/** Keep `layers` worn on `rig` while mounted; a changed list takes the old pieces off first. Pass a stable array. */
export function useWornLayers(rig: THREE.Object3D, layers: readonly WornLayer[]): void {
  useEffect(() => {
    if (layers.length === 0) return;
    const undo = layers.map((layer) => attachWornLayer(rig, layer));
    return () => {
      for (const off of undo) off();
    };
  }, [rig, layers]);
}
