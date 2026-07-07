import type { Aim } from "../scene/spatial";

export type PointerVec3 = readonly [number, number, number];

/**
 * Renderer-free result of a screen→world raycast. The shell's pointer service
 * produces this from the cursor; core-side gameplay (item.use aim, click-to-move,
 * ground-target abilities, pings) consumes it without touching three.js.
 */
export interface PointerHit {
  /** World-space point under the cursor (surface or ground plane). */
  point: PointerVec3;
  /** World-space surface normal at the hit; `[0, 1, 0]` for the ground plane. */
  normal: PointerVec3;
  /** Topmost scene-entity instance id under the cursor, or null over open ground. */
  entity: string | null;
  /** Topmost scene-object instance id under the cursor, or null. */
  object: string | null;
}

export type PointerButton = "primary" | "secondary" | "middle";

/** Build an `origin → point` aim for `item.use` / projectiles, firing toward the cursor. */
export function aimToPoint(origin: PointerVec3, point: PointerVec3): Aim {
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  const dz = point[2] - origin[2];
  const length = Math.hypot(dx, dy, dz);
  const direction: PointerVec3 = length < 1e-9 ? [0, 0, 1] : [dx / length, dy / length, dz / length];
  return { origin, direction };
}

/** The move-to target of a pointer hit — sugar over `hit.point`. */
export function moveTargetFromHit(hit: PointerHit): PointerVec3 {
  return hit.point;
}

/** Project a pointer hit onto the XZ plane for navmesh routing (`findPath` takes `[x, z]`). */
export function groundOf(hit: PointerHit): readonly [number, number] {
  return [hit.point[0], hit.point[2]];
}
