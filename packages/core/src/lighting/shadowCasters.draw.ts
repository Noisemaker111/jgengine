import * as THREE from "three";

/**
 * World-space bounding-sphere radius a mesh needs before its shadow is worth a depth
 * draw. Below this the silhouette is a couple of shadow-map texels wide at every
 * cascade that reaches it, so the pass spends a draw for a smudge.
 * @internal
 */
export const MIN_SHADOW_CASTER_RADIUS = 0.5;

/** A live caster cull: what it is keeping, and how to put the authored flags back. @internal */
export interface ShadowCasterCull {
  /** Meshes still casting in the tree, and how many were cleared for being under the radius. */
  stats(): { casters: number; skipped: number; minRadius: number };
  restore(): void;
}

function maxAxisScale(node: THREE.Object3D): number {
  const e = node.matrixWorld.elements;
  return Math.max(
    Math.hypot(e[0]!, e[1]!, e[2]!),
    Math.hypot(e[4]!, e[5]!, e[6]!),
    Math.hypot(e[8]!, e[9]!, e[10]!),
  );
}

/** Bounding-sphere radius of what a mesh draws, in world units; an instance batch counts as its whole spread. @internal */
export function shadowCasterRadius(mesh: THREE.Mesh): number | null {
  if ((mesh as THREE.InstancedMesh).isInstancedMesh === true) {
    const batch = mesh as THREE.InstancedMesh;
    if (batch.boundingSphere === null) batch.computeBoundingSphere();
    return batch.boundingSphere === null ? null : batch.boundingSphere.radius * maxAxisScale(batch);
  }
  const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
  if (geometry === undefined || geometry === null) return null;
  if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere;
  return sphere === null ? null : sphere.radius * maxAxisScale(mesh);
}

/** True when a mesh's shadow is smaller than the map can resolve, so the depth pass should skip it. @internal */
export function isUnderShadowCasterSize(mesh: THREE.Mesh, minRadius = MIN_SHADOW_CASTER_RADIUS): boolean {
  const radius = shadowCasterRadius(mesh);
  return radius !== null && radius < minRadius;
}

const depthMaterials = new WeakMap<THREE.Material, Map<string, THREE.MeshDepthMaterial>>();

/** What about a mesh picks a different depth shader: instancing, batching, skinning, morphing. */
function depthKind(mesh: THREE.Mesh): string {
  const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh === true;
  const batched = (mesh as THREE.BatchedMesh).isBatchedMesh === true;
  const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
  const morphed = mesh.geometry?.morphAttributes?.["position"] !== undefined;
  return `${instanced ? "i" : ""}${instanced && (mesh as THREE.InstancedMesh).instanceColor !== null ? "c" : ""}${batched ? "b" : ""}${skinned ? "s" : ""}${morphed ? "m" : ""}`;
}

/**
 * Give a shadow caster its own depth material, one per caster material and mesh kind. three draws
 * every caster without one through a single shared depth material and copies each caster's map and
 * side into it, so a pass that alternates textured, instanced, batched and plain casters rebuilds
 * that material's program on almost every draw. three still copies the live map, side and alpha
 * test across each draw, so the shadow stays what the caster's material says.
 * @internal
 */
export function giveStableShadowDepth(mesh: THREE.Mesh): void {
  if (mesh.customDepthMaterial !== undefined || Array.isArray(mesh.material)) return;
  const material = mesh.material;
  let byKind = depthMaterials.get(material);
  if (byKind === undefined) {
    const made = new Map<string, THREE.MeshDepthMaterial>();
    byKind = made;
    depthMaterials.set(material, made);
    material.addEventListener("dispose", () => {
      for (const depth of made.values()) depth.dispose();
      depthMaterials.delete(material);
    });
  }
  const kind = depthKind(mesh);
  let depth = byKind.get(kind);
  if (depth === undefined) {
    depth = new THREE.MeshDepthMaterial();
    byKind.set(kind, depth);
  }
  mesh.customDepthMaterial = depth;
}

/**
 * Clear `castShadow` on attached meshes under `minRadius` as nodes stream in, and put the
 * authored value back when they leave. Only clears: a mesh the game keeps out of the pass
 * is never turned back on. Instanced and batched meshes always keep casting: they fill after they
 * join the scene. The casters it keeps get a stable depth material ({@link giveStableShadowDepth}).
 * @internal
 */
export function cullSmallShadowCasters(root: THREE.Object3D, minRadius = MIN_SHADOW_CASTER_RADIUS): ShadowCasterCull {
  const cleared = new Map<THREE.Mesh, boolean>();
  const listeners = new Map<THREE.Object3D, () => void>();

  const apply = (node: THREE.Object3D): void => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true || cleared.has(mesh) || mesh.castShadow !== true) return;
    node.updateWorldMatrix(true, false);
    // A batch joins the scene before its instances do, so its size here is not what it will draw:
    // judged empty, the static scenery pool's batches lost their shadows for the session and only
    // got them back when a remounted canvas found them full. Batches are never judged.
    const batch = (mesh as THREE.InstancedMesh).isInstancedMesh === true || (mesh as THREE.BatchedMesh).isBatchedMesh === true;
    if (batch || !isUnderShadowCasterSize(mesh, minRadius)) {
      giveStableShadowDepth(mesh);
      return;
    }
    cleared.set(mesh, mesh.castShadow);
    mesh.castShadow = false;
  };

  const restoreTree = (node: THREE.Object3D): void => {
    const mesh = node as THREE.Mesh;
    const authored = cleared.get(mesh);
    if (authored !== undefined) {
      mesh.castShadow = authored;
      cleared.delete(mesh);
    }
    for (const child of node.children) restoreTree(child);
  };

  // A node that leaves the tree stops being watched, so draws a field adds and drops as the camera
  // moves are not held here for the rest of the session.
  const detach = (node: THREE.Object3D): void => {
    const off = listeners.get(node);
    if (off === undefined) return;
    off();
    listeners.delete(node);
    for (const child of node.children) detach(child);
  };

  const attach = (node: THREE.Object3D): void => {
    if (listeners.has(node)) return;
    apply(node);
    const added = ({ child }: THREE.Object3DEventMap["childadded"]) => attach(child);
    const removed = ({ child }: THREE.Object3DEventMap["childremoved"]) => {
      restoreTree(child);
      detach(child);
    };
    node.addEventListener("childadded", added);
    node.addEventListener("childremoved", removed);
    listeners.set(node, () => {
      node.removeEventListener("childadded", added);
      node.removeEventListener("childremoved", removed);
    });
    for (const child of node.children) attach(child);
  };

  attach(root);
  return {
    stats(): { casters: number; skipped: number; minRadius: number } {
      let casters = 0;
      root.traverse((node) => {
        if ((node as THREE.Mesh).isMesh === true && (node as THREE.Mesh).castShadow) casters += 1;
      });
      return { casters, skipped: cleared.size, minRadius };
    },
    restore(): void {
      for (const off of listeners.values()) off();
      listeners.clear();
      restoreTree(root);
    },
  };
}
