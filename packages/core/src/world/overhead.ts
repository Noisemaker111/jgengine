import type { WorldSolid, WorldSolids } from "./worldSolids";

/** {@link solidOverhead} knobs. */
export interface OverheadOptions {
  /** Height above the point the search starts (over the head, so the floor and the body's own box never count). Default 1.9. */
  clearance?: number;
  /** How far up to look. Default 40. */
  reach?: number;
}

function covers(solid: WorldSolid, x: number, z: number, low: number, high: number): boolean {
  const [cx, cy, cz] = solid.center;
  const [hx, hy, hz] = solid.halfExtents;
  if (cy + hy < low || cy - hy > high) return false;
  // Into the solid's own frame: undo its yaw about the centre.
  const yaw = solid.rotationY ?? 0;
  const dx = x - cx;
  const dz = z - cz;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= hx && Math.abs(lz) <= hz;
}

/**
 * Whether something solid is overhead: a ceiling, a roof, cave rock, anything in the world's solids straight above
 * `at`, between `clearance` and `reach` over it. What keeps the rain off a survivor and lets a roof count as shelter.
 *
 * @capability solid-overhead test whether a roof, ceiling or rock overhangs a point, from the world's solids
 */
export function solidOverhead(solids: Pick<WorldSolids, "inBox">, at: readonly [number, number, number], options: OverheadOptions = {}): boolean {
  const low = at[1] + (options.clearance ?? 1.9);
  const high = at[1] + (options.reach ?? 40);
  const [x, , z] = at;
  for (const solid of solids.inBox([x - 0.01, low, z - 0.01], [x + 0.01, high, z + 0.01])) {
    if (covers(solid, x, z, low, high)) return true;
  }
  return false;
}
