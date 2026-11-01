import type { FaunaGroupState } from "./ambientFauna";

/** The camera as the cull reads it: six frustum planes (nx,ny,nz,d each, normalised) and the eye. */
export interface FaunaView {
  planes: Float32Array;
  x: number;
  y: number;
  z: number;
}

/** A fresh view with all planes open. */
export function createFaunaView(): FaunaView {
  return { planes: new Float32Array(24), x: 0, y: 0, z: 0 };
}

/**
 * Write the six frustum planes of a column-major view-projection matrix (three.js `Matrix4.elements`
 * of projection × viewInverse) and the eye position. Allocates nothing.
 */
export function writeFaunaView(view: FaunaView, viewProjection: ArrayLike<number>, eyeX: number, eyeY: number, eyeZ: number): void {
  const e = viewProjection;
  const planes = view.planes;
  for (let p = 0; p < 6; p += 1) {
    const axis = p >> 1;
    const sign = p % 2 === 1 ? -1 : 1;
    const a = e[3]! + sign * e[axis]!;
    const b = e[7]! + sign * e[4 + axis]!;
    const c = e[11]! + sign * e[8 + axis]!;
    const d = e[15]! + sign * e[12 + axis]!;
    const length = Math.hypot(a, b, c) || 1;
    planes[p * 4] = a / length;
    planes[p * 4 + 1] = b / length;
    planes[p * 4 + 2] = c / length;
    planes[p * 4 + 3] = d / length;
  }
  view.x = eyeX;
  view.y = eyeY;
  view.z = eyeZ;
}

/** True when a sphere touches the frustum. */
export function sphereInView(view: FaunaView, x: number, y: number, z: number, radius: number): boolean {
  const planes = view.planes;
  for (let p = 0; p < 24; p += 4) {
    if (planes[p]! * x + planes[p + 1]! * y + planes[p + 2]! * z + planes[p + 3]! < -radius) return false;
  }
  return true;
}

/** How many agents {@link selectVisible} put in each LOD list. */
export interface FaunaSelection {
  near: number;
  far: number;
}

/**
 * Pick which of a group's out agents to draw: inside the frustum and within `lod.far`, at most
 * `limit`, each in the `near` list (model) up to `lod.near` or the `far` list (sprite) past it. Fills
 * the caller's index arrays and `out`; allocates nothing.
 */
export function selectVisible(
  state: FaunaGroupState,
  view: FaunaView,
  radius: number,
  limit: number,
  nearList: Int32Array,
  farList: Int32Array,
  out: FaunaSelection,
): void {
  out.near = 0;
  out.far = 0;
  const { near, far } = state.spec.lod;
  const nearSq = near * near;
  const farSq = far * far;
  const position = state.position;
  const cap = Math.min(limit, state.spec.budget);
  let drawn = 0;
  for (let i = 0; i < state.active && drawn < cap; i += 1) {
    const x = position[i * 3]!;
    const y = position[i * 3 + 1]!;
    const z = position[i * 3 + 2]!;
    const dx = x - view.x;
    const dy = y - view.y;
    const dz = z - view.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > farSq || !sphereInView(view, x, y, z, radius)) continue;
    if (distanceSq <= nearSq) nearList[out.near++] = i;
    else farList[out.far++] = i;
    drawn += 1;
  }
}
