/** One integer grid cell on an axis-aligned world lattice — `{x, z}` in *cell* units, not world units. */
export interface GridCoord {
  readonly x: number;
  readonly z: number;
}

/** The four cardinal grid directions. */
export type GridDir = "north" | "south" | "east" | "west";

/**
 * Unit step, in cells, for each cardinal direction: north is `-z`, south `+z`, east `+x`, west `-x`
 * (a `+z`-forward world, matching `atan2(dx, dz)` facing). Add one to a cell to walk a square.
 */
export const DIR_VECTORS: Record<GridDir, GridCoord> = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};

/** The cardinals in clockwise order (`north → east → south → west`) — iterate for turn/rotation logic. */
export const DIR_ORDER: readonly GridDir[] = ["north", "east", "south", "west"];

/**
 * Stable string key for a cell, for `Map`/`Set` occupancy lookups.
 *
 * @capability grid-cell integer grid-cell coordinates, cardinal steps, and yaw quantization
 */
export function cellKey(cell: GridCoord): string {
  return `${cell.x},${cell.z}`;
}

/**
 * True when two cells address the same lattice square.
 *
 * @capability grid-cell integer grid-cell coordinates, cardinal steps, and yaw quantization
 */
export function sameCell(a: GridCoord, b: GridCoord): boolean {
  return a.x === b.x && a.z === b.z;
}

/**
 * The cell reached by stepping `cell` by `step` cells — add a `DIR_VECTORS[dir]` to walk one square.
 *
 * @capability grid-cell integer grid-cell coordinates, cardinal steps, and yaw quantization
 */
export function addCell(cell: GridCoord, step: GridCoord): GridCoord {
  return { x: cell.x + step.x, z: cell.z + step.z };
}

/**
 * Quantize a body yaw (`atan2(sinX, cosZ)`, 0 = `+z` / south) to the nearest cardinal grid direction.
 *
 * @capability grid-cell integer grid-cell coordinates, cardinal steps, and yaw quantization
 */
export function yawToDir(yaw: number): GridDir {
  const x = Math.sin(yaw);
  const z = Math.cos(yaw);
  if (Math.abs(x) >= Math.abs(z)) return x >= 0 ? "east" : "west";
  return z >= 0 ? "south" : "north";
}
