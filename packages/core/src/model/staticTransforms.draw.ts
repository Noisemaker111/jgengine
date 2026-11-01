import * as THREE from "three";

const frozenRoots = new WeakSet<THREE.Object3D>();
/** Frozen nodes that composed their own matrix before they froze; a hand-written matrix is kept as written. */
const composing = new WeakSet<THREE.Object3D>();

/**
 * Whether {@link freezeStaticTransforms} froze this node as the root of a subtree. The scene's matrix
 * pass skips such a subtree whole, so a frozen prop costs nothing per frame.
 * @internal
 */
export function isFrozenRoot(node: THREE.Object3D): boolean {
  return frozenRoots.has(node);
}

/**
 * Bake a subtree's world matrices from its current pose and take it out of three's per-frame
 * `updateMatrixWorld` pass. Three recomposes every node that keeps `matrixAutoUpdate` and then forces
 * its whole subtree to rebuild the world matrix, so authored scenery — terrain, batched props,
 * scatter, instanced ground — pays that cost every frame for a pose it never changes (#2038).
 *
 * Freeze a subtree only when its pose is final and its ancestors stay put: a frozen node ignores a
 * moving parent, and a frozen light or camera stops following the scene. The scene's matrix pass
 * then skips the whole subtree, so a node added under it later stays where it was mounted until
 * {@link refreshStaticTransforms}. Actors, their bones and anything a game writes per frame keep
 * auto-updating; a frozen seam that moves on a rare event (a door, a lift) calls
 * {@link refreshStaticTransforms} after it moves, or thaws for as long as it keeps moving.
 * @capability static-transforms
 */
export function freezeStaticTransforms(root: THREE.Object3D): void {
  root.updateWorldMatrix(true, false);
  bakeSubtree(root);
  frozenRoots.add(root);
}

/**
 * Re-bake a frozen subtree's world matrices from its current position, rotation and scale, and its
 * parent's world matrix: the one-off update for static content something moved (a door swung, a
 * placement edited). Nodes added under it since it froze freeze with it.
 * @capability static-transforms
 */
export function refreshStaticTransforms(root: THREE.Object3D): void {
  if (root.parent !== null) root.parent.updateWorldMatrix(true, false);
  bakeSubtree(root);
}

function bakeSubtree(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (node.matrixAutoUpdate) composing.add(node);
    if (composing.has(node)) node.updateMatrix();
    if (node.parent === null) node.matrixWorld.copy(node.matrix);
    else node.matrixWorld.multiplyMatrices(node.parent.matrixWorld, node.matrix);
    node.matrixAutoUpdate = false;
    node.matrixWorldAutoUpdate = false;
    node.matrixWorldNeedsUpdate = false;
  });
}

/**
 * Put a subtree back on the per-frame matrix pass after {@link freezeStaticTransforms} — for the
 * authored seam that moves on an event rather than every frame.
 * @capability static-transforms
 */
export function thawStaticTransforms(root: THREE.Object3D): void {
  frozenRoots.delete(root);
  root.traverse((node) => {
    node.matrixAutoUpdate = composing.delete(node) || node.matrixAutoUpdate;
    node.matrixWorldAutoUpdate = true;
    node.matrixWorldNeedsUpdate = true;
  });
}
