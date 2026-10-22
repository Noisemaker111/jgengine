import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const MERGED_NAMES_KEY = "jgMergedMeshNames";

let mergeEnabled = true;

/**
 * Turn load-time sub-mesh merging on or off. On (the default) every loaded model whose meshes share a
 * material collapses to one mesh per material, which is what a game with many instances of a
 * multi-mesh prop needs; a game that must keep per-mesh nodes (named material slots, node visibility)
 * turns it off.
 * @internal
 */
export function setModelSubMeshMerge(enabled: boolean): void {
  mergeEnabled = enabled;
}

/** The node names a merged mesh absorbed, in the order they were merged. Empty for an unmerged mesh. @internal */
export function mergedMeshNames(mesh: THREE.Object3D): readonly string[] {
  const names = mesh.userData[MERGED_NAMES_KEY];
  return Array.isArray(names) ? (names as string[]) : [];
}

/**
 * Whether a mesh answers to `name`: its own name, or one of the sub-meshes a load-time merge folded
 * into it. Name-based lookups (material assignment selectors) go through this so a merged model keeps
 * resolving the names its source meshes had.
 * @internal
 */
export function meshMatchesName(mesh: THREE.Object3D, name: string): boolean {
  return mesh.name === name || mergedMeshNames(mesh).includes(name);
}

/** What {@link mergeModelSubMeshes} did to one loaded model. @internal */
export interface ModelMeshMergeReport {
  /** Meshes removed from the graph because their geometry joined a same-material sibling. */
  merged: number;
  /** Meshes left in place. */
  kept: number;
}

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh === true) count += 1;
  });
  return count;
}

/** Skinning, instancing and bone parents are all driven at runtime, so their transforms cannot be baked. */
function hasRiggedAncestor(mesh: THREE.Object3D, root: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = mesh;
  while (node !== null && node !== root) {
    if ((node as THREE.Bone).isBone === true) return true;
    if ((node as THREE.SkinnedMesh).isSkinnedMesh === true) return true;
    node = node.parent;
  }
  return false;
}

/** Attribute layout two geometries must agree on before their vertices can share a draw. */
function attributeKey(geometry: THREE.BufferGeometry): string {
  const parts = [geometry.index === null ? "plain" : "indexed"];
  for (const name of Object.keys(geometry.attributes).sort()) {
    const attribute = geometry.attributes[name]!;
    parts.push(`${name}:${attribute.itemSize}:${attribute.normalized === true ? 1 : 0}`);
  }
  return parts.join(",");
}

function isMergeable(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh === true || (mesh as THREE.InstancedMesh).isInstancedMesh === true) return false;
  // A node with children carries them: removing it would orphan them, and merging the children instead
  // is handled by their own groups.
  if (mesh.children.length > 0) return false;
  if (mesh.visible !== true) return false;
  if (Array.isArray(mesh.material) || mesh.material === undefined || mesh.material === null) return false;
  const geometry = mesh.geometry;
  if (geometry === undefined || geometry.attributes.position === undefined) return false;
  if (Object.keys(geometry.morphAttributes).length > 0) return false;
  return !hasRiggedAncestor(mesh, root);
}

/**
 * Collapse a freshly loaded model's meshes that share a material into one mesh per material, baking
 * each mesh's transform relative to `root` into the merged vertices. Runs once per load, so every
 * instance cloned from the model inherits the lower draw count.
 *
 * Skinned meshes, instanced meshes, meshes with morph targets or rigged ancestors, meshes with
 * children, hidden meshes, mirrored meshes, and every model carrying an animation clip are left
 * untouched: a clip can move any node in the file, so baking an animated model's transforms would
 * freeze it.
 * @internal
 */
export function mergeModelSubMeshes(
  root: THREE.Object3D,
  animations: readonly THREE.AnimationClip[] = [],
): ModelMeshMergeReport {
  if (!mergeEnabled || animations.length > 0) return { merged: 0, kept: countMeshes(root) };

  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const groups = new Map<string, { material: THREE.Material; meshes: { mesh: THREE.Mesh; relative: THREE.Matrix4 }[] }>();
  let kept = 0;

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    if (!isMergeable(mesh, root)) {
      kept += 1;
      return;
    }
    // A mirrored node renders with flipped winding, which a baked vertex has no way to express.
    const relative = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    if (relative.determinant() < 0) {
      kept += 1;
      return;
    }
    const material = mesh.material as THREE.Material;
    const key = `${material.uuid}|${attributeKey(mesh.geometry)}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { material, meshes: [{ mesh, relative }] });
    else group.meshes.push({ mesh, relative });
  });

  let merged = 0;
  for (const group of groups.values()) {
    if (group.meshes.length < 2) {
      kept += group.meshes.length;
      continue;
    }
    const parts = group.meshes.map(({ mesh, relative }) => mesh.geometry.clone().applyMatrix4(relative));
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (geometry === null) {
      kept += group.meshes.length;
      continue;
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const first = group.meshes[0]!.mesh;
    const mesh = new THREE.Mesh(geometry, group.material);
    mesh.name = first.name;
    mesh.renderOrder = first.renderOrder;
    mesh.frustumCulled = first.frustumCulled;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    const names = [...new Set(group.meshes.map(({ mesh: source }) => source.name).filter((name) => name.length > 0))];
    if (names.length > 0) mesh.userData[MERGED_NAMES_KEY] = names;

    for (const { mesh: source } of group.meshes) source.removeFromParent();
    root.add(mesh);
    merged += group.meshes.length - 1;
    kept += 1;
  }

  return { merged, kept };
}
