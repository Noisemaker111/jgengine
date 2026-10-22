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
  stats(): { casters: number; skipped: number };
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

/**
 * Clear `castShadow` on attached meshes under `minRadius` as nodes stream in, and put the
 * authored value back when they leave. Only clears: a mesh the game keeps out of the pass
 * is never turned back on.
 * @internal
 */
export function cullSmallShadowCasters(root: THREE.Object3D, minRadius = MIN_SHADOW_CASTER_RADIUS): ShadowCasterCull {
  const cleared = new Map<THREE.Mesh, boolean>();
  const listeners = new Map<THREE.Object3D, () => void>();

  const apply = (node: THREE.Object3D): void => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true || cleared.has(mesh) || mesh.castShadow !== true) return;
    node.updateWorldMatrix(true, false);
    if (!isUnderShadowCasterSize(mesh, minRadius)) return;
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

  const attach = (node: THREE.Object3D): void => {
    if (listeners.has(node)) return;
    apply(node);
    const added = ({ child }: THREE.Object3DEventMap["childadded"]) => attach(child);
    const removed = ({ child }: THREE.Object3DEventMap["childremoved"]) => restoreTree(child);
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
    stats(): { casters: number; skipped: number } {
      let casters = 0;
      root.traverse((node) => {
        if ((node as THREE.Mesh).isMesh === true && (node as THREE.Mesh).castShadow) casters += 1;
      });
      return { casters, skipped: cleared.size };
    },
    restore(): void {
      for (const off of listeners.values()) off();
      listeners.clear();
      restoreTree(root);
    },
  };
}
