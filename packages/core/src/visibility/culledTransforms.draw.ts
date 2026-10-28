import type * as THREE from "three";
import { SkinnedMesh } from "three";

const culled = new WeakSet<THREE.Object3D>();

/**
 * Hide a marker group because culling put it out of view, or show it again. A culled group's
 * subtree leaves the scene's matrix pass until it is shown, and the pass it returns in rebuilds it.
 * Hide for any other reason with plain `visible = false`, which keeps the subtree's matrices live.
 * @internal
 */
export function setCulled(node: THREE.Object3D, isCulled: boolean): void {
  if (isCulled) culled.add(node);
  else {
    culled.delete(node);
    // Its parent may have moved while the pass skipped it; rebuild the subtree on its way back.
    tracked(node)[LOCAL] = undefined;
  }
}

/**
 * Show or hide a node that drew nothing useful while hidden (an emptied instanced chunk, a field
 * chunk past its draw distance), leaving the matrix pass with it; a no-op when nothing changes.
 * @internal
 */
export function showCulled(node: THREE.Object3D, shown: boolean): void {
  if (node.visible === shown) return;
  node.visible = shown;
  setCulled(node, !shown);
}

const LOCAL = Symbol("jg.localTransform");

interface Tracked {
  [LOCAL]?: Float64Array | undefined;
}

/** The node with the pass's snapshot slot; a symbol property is the cheapest per-node lookup. */
function tracked(node: THREE.Object3D): THREE.Object3D & Tracked {
  return node as THREE.Object3D & Tracked;
}

// A node's snapshot from the pass that last rebuilt it: what its local matrix was made of (position,
// rotation and scale, or the hand-written matrix of a node that does not compose its own), whether it
// composed it, its parent's id, and the world matrix the pass wrote.
const SIGNATURE = 16;
const MODE = 16;
const PARENT = 17;
const WORLD = 18;
const SNAPSHOT_SIZE = WORLD + 16;

function writeSignature(node: THREE.Object3D, snapshot: Float64Array, composes: boolean): void {
  if (composes) {
    const p = node.position;
    const q = node.quaternion;
    const s = node.scale;
    snapshot[0] = p.x;
    snapshot[1] = p.y;
    snapshot[2] = p.z;
    snapshot[3] = q.x;
    snapshot[4] = q.y;
    snapshot[5] = q.z;
    snapshot[6] = q.w;
    snapshot[7] = s.x;
    snapshot[8] = s.y;
    snapshot[9] = s.z;
  } else {
    const elements = node.matrix.elements;
    for (let index = 0; index < SIGNATURE; index += 1) snapshot[index] = elements[index] ?? 0;
  }
}

function signatureChanged(node: THREE.Object3D, snapshot: Float64Array, composes: boolean): boolean {
  if (composes) {
    const p = node.position;
    const q = node.quaternion;
    const s = node.scale;
    return snapshot[0] !== p.x || snapshot[1] !== p.y || snapshot[2] !== p.z ||
      snapshot[3] !== q.x || snapshot[4] !== q.y || snapshot[5] !== q.z || snapshot[6] !== q.w ||
      snapshot[7] !== s.x || snapshot[8] !== s.y || snapshot[9] !== s.z;
  }
  const elements = node.matrix.elements;
  for (let index = 0; index < SIGNATURE; index += 1) if (snapshot[index] !== elements[index]) return true;
  return false;
}

/**
 * Whether something other than the pass wrote this world matrix since the pass last did (a pose held
 * for one render, say). Unrolled, and the bottom row skipped (a world matrix is affine): it runs for
 * every shown node every frame, and the loop form was most of the pass's cost.
 */
function worldChanged(node: THREE.Object3D, snapshot: Float64Array): boolean {
  const e = node.matrixWorld.elements;
  return snapshot[WORLD + 12] !== e[12] || snapshot[WORLD + 13] !== e[13] || snapshot[WORLD + 14] !== e[14] ||
    snapshot[WORLD] !== e[0] || snapshot[WORLD + 1] !== e[1] || snapshot[WORLD + 2] !== e[2] ||
    snapshot[WORLD + 4] !== e[4] || snapshot[WORLD + 5] !== e[5] || snapshot[WORLD + 6] !== e[6] ||
    snapshot[WORLD + 8] !== e[8] || snapshot[WORLD + 9] !== e[9] || snapshot[WORLD + 10] !== e[10];
}

/**
 * One node's step of the pass: recompose and rebuild its world matrix when stale; true when it was
 * rebuilt, which rebuilds its children too. Stale means its position, rotation, scale (or hand-written
 * matrix), parent or world matrix changed since the pass last rebuilt it. Most of a scene stands still,
 * and three recomposed every node every frame and then rebuilt every world matrix under it.
 * `matrixWorldNeedsUpdate` is no signal for a node that composes its own matrix: three's
 * `getWorldPosition` and friends set it on every ancestor up to the scene, so one call per frame
 * anywhere rebuilt the whole tree. The parent is kept by id, so a pooled node does not hold its old
 * parent alive.
 */
function updateShownNode(node: THREE.Object3D, force: boolean): boolean {
  const slot = tracked(node);
  const composes = node.matrixAutoUpdate;
  const parent = node.parent === null ? -1 : node.parent.id;
  let snapshot = slot[LOCAL];
  let stale: boolean;
  if (snapshot === undefined) {
    snapshot = new Float64Array(SNAPSHOT_SIZE);
    slot[LOCAL] = snapshot;
    stale = true;
  } else {
    stale = snapshot[MODE] !== (composes ? 1 : 0) || snapshot[PARENT] !== parent || signatureChanged(node, snapshot, composes) ||
      (node.matrixWorldAutoUpdate && worldChanged(node, snapshot));
  }
  if (!composes && node.matrixWorldNeedsUpdate) stale = true;
  if (stale) {
    if (composes) node.updateMatrix();
    writeSignature(node, snapshot, composes);
    snapshot[MODE] = composes ? 1 : 0;
    snapshot[PARENT] = parent;
  }
  if (!stale && !force) return false;
  if (node.matrixWorldAutoUpdate) {
    if (node.parent === null) node.matrixWorld.copy(node.matrix);
    else node.matrixWorld.multiplyMatrices(node.parent.matrixWorld, node.matrix);
    const world = node.matrixWorld.elements;
    for (let index = 0; index < 16; index += 1) snapshot[WORLD + index] = world[index] ?? 0;
    // Three's own SkinnedMesh.updateMatrixWorld does this: an attached skin is posed relative to where
    // the mesh hangs now. Left stale, a character drawn on its own rig is skinned against where it was
    // first mounted and floats away from its body as it moves.
    if (node instanceof SkinnedMesh && node.bindMode === "attached") node.bindMatrixInverse.copy(node.matrixWorld).invert();
  }
  node.matrixWorldNeedsUpdate = false;
  return true;
}

/**
 * Parents before children, with its own stack: a recursive walk over a scene's mix of node classes
 * cost several times more than the work it did at each node.
 */
function updateShownMatrixWorld(root: THREE.Object3D, force: boolean): void {
  const nodes: THREE.Object3D[] = [root];
  const forced: boolean[] = [force];
  for (let node = nodes.pop(); node !== undefined; node = nodes.pop()) {
    const childForce = updateShownNode(node, forced.pop() === true);
    const children = node.children;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child === undefined || (!child.visible && culled.has(child))) continue;
      nodes.push(child);
      forced.push(childForce);
    }
  }
}

/**
 * Three walks and recomposes every node of the scene each frame, culled ones included; this scene's
 * pass skips the subtrees {@link setCulled} hid, so props and actors out of view cost nothing there,
 * and recomposes only nodes whose position, rotation or scale changed, so a still prop costs a compare.
 * A matrix written by hand needs `matrixAutoUpdate = false`, as in three.
 * @internal
 */
export function skipCulledMatrices(scene: THREE.Object3D): void {
  scene.updateMatrixWorld = function updateMatrixWorld(this: THREE.Object3D, force?: boolean) {
    updateShownMatrixWorld(this, force === true);
  };
}
