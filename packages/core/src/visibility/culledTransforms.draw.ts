import type * as THREE from "three";

const culled = new WeakSet<THREE.Object3D>();

/**
 * Hide a marker group because culling put it out of view, or show it again. A culled group's
 * subtree leaves the scene's matrix pass until it is shown, and the pass it returns in rebuilds it.
 * Hide for any other reason with plain `visible = false`, which keeps the subtree's matrices live.
 * @internal
 */
export function setCulled(node: THREE.Object3D, isCulled: boolean): void {
  if (isCulled) culled.add(node);
  else culled.delete(node);
}

function updateShownMatrixWorld(node: THREE.Object3D, force: boolean): void {
  if (node.matrixAutoUpdate) node.updateMatrix();
  if (node.matrixWorldNeedsUpdate || force) {
    if (node.matrixWorldAutoUpdate) {
      if (node.parent === null) node.matrixWorld.copy(node.matrix);
      else node.matrixWorld.multiplyMatrices(node.parent.matrixWorld, node.matrix);
      // Three's own SkinnedMesh.updateMatrixWorld does this: an attached skin is posed relative to where
      // the mesh hangs now. Left stale, a character drawn on its own rig is skinned against where it was
      // first mounted and floats away from its body as it moves.
      const skinned = node as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh === true && skinned.bindMode === "attached") skinned.bindMatrixInverse.copy(skinned.matrixWorld).invert();
    }
    node.matrixWorldNeedsUpdate = false;
    force = true;
  }
  const children = node.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    if (!child.visible && culled.has(child)) continue;
    updateShownMatrixWorld(child, force);
  }
}

/**
 * Three walks and recomposes every node of the scene each frame, culled ones included; this scene's
 * pass skips the subtrees {@link setCulled} hid, so props and actors out of view cost nothing there.
 * @internal
 */
export function skipCulledMatrices(scene: THREE.Object3D): void {
  scene.updateMatrixWorld = function updateMatrixWorld(this: THREE.Object3D, force?: boolean) {
    updateShownMatrixWorld(this, force === true);
  };
}
