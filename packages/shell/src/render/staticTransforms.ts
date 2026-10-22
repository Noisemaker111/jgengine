import * as THREE from "three";

/**
 * Bake a subtree's world matrices from its current pose and take it out of three's per-frame
 * `updateMatrixWorld` pass. Three recomposes every node that keeps `matrixAutoUpdate` and then forces
 * its whole subtree to rebuild the world matrix, so authored scenery — terrain, batched props,
 * scatter, instanced ground — pays that cost every frame for a pose it never changes (#2038).
 *
 * Freeze a subtree only when its pose is final and its ancestors stay put: a frozen node ignores a
 * moving parent, and a frozen light or camera stops following the scene. Actors, their bones and
 * anything a game writes per frame keep auto-updating; a frozen seam that moves on a rare event
 * (a door, a lift) thaws, moves, then freezes again.
 * @capability static-transforms
 */
export function freezeStaticTransforms(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    node.matrixAutoUpdate = false;
    node.matrixWorldAutoUpdate = false;
  });
}

/**
 * Put a subtree back on the per-frame matrix pass after {@link freezeStaticTransforms} — for the
 * authored seam that moves on an event rather than every frame.
 * @capability static-transforms
 */
export function thawStaticTransforms(root: THREE.Object3D): void {
  root.traverse((node) => {
    node.matrixAutoUpdate = true;
    node.matrixWorldAutoUpdate = true;
    node.matrixWorldNeedsUpdate = true;
  });
}
