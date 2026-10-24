import type * as THREE from "three";

/**
 * What one instanced draw submits this frame. Three skips a draw whose instance count is zero and
 * skips an invisible node, so the count and the visibility are one answer: every path that claims a
 * subset of a batch's placements — a variant level, a species, a proxy, an authored primitive group —
 * states it here, and one that holds nothing submits nothing.
 * @internal
 */
export function submitInstanceCount(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.visible = count > 0;
}

/** Whether three issues a draw for this node this frame: instanced, visible, and holding an instance. @internal */
export function submitsDraw(node: THREE.Object3D): boolean {
  const mesh = node as THREE.InstancedMesh;
  return mesh.isInstancedMesh === true && node.visible && mesh.count > 0;
}

/** Instanced draws a subtree submits this frame, optionally only the nodes an owner tagged. @internal */
export function countSubmittedDraws(root: THREE.Object3D, tag?: string): number {
  let draws = 0;
  root.traverse((node) => {
    if (tag !== undefined && node.userData[tag] !== true) return;
    if (submitsDraw(node)) draws += 1;
  });
  return draws;
}
