import type { WorldSolid, WorldSolids } from "./worldSolids";

export interface OverheadOptions {
  /** Height above the point the search starts (over the head, so the floor and the body's own box never count). Default 1.9. */
  clearance?: number;
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

/** @capability solid-overhead test whether a roof, ceiling or rock overhangs a point, from the world's solids */
export function solidOverhead(solids: Pick<WorldSolids, "inBox">, at: readonly [number, number, number], options: OverheadOptions = {}): boolean {
  const low = at[1] + (options.clearance ?? 1.9);
  const high = at[1] + (options.reach ?? 40);
  const [x, , z] = at;
  for (const solid of solids.inBox([x - 0.01, low, z - 0.01], [x + 0.01, high, z + 0.01])) {
    if (covers(solid, x, z, low, high)) return true;
  }
  return false;
}

export interface EnclosureOptions extends OverheadOptions {
  directions?: number;
  wallReach?: number;
  wallHeight?: number;
  step?: number;
}

/** @capability solid-enclosure measure how enclosed a point is by a roof and walls, from the world's solids */
export function solidEnclosure(solids: Pick<WorldSolids, "inBox">, at: readonly [number, number, number], options: EnclosureOptions = {}): number {
  if (!solidOverhead(solids, at, options)) return 0;
  const directions = options.directions ?? 8;
  const reach = options.wallReach ?? 6;
  const step = options.step ?? 0.25;
  const height = at[1] + (options.wallHeight ?? 1);
  let walled = 0;
  for (let way = 0; way < directions; way += 1) {
    const angle = (way / directions) * Math.PI * 2;
    const dx = Math.sin(angle);
    const dz = Math.cos(angle);
    for (let along = step; along <= reach + 1e-9; along += step) {
      const x = at[0] + dx * along;
      const z = at[2] + dz * along;
      const hit = solids.inBox([x - 0.01, height - 0.01, z - 0.01], [x + 0.01, height + 0.01, z + 0.01]).some((solid) => covers(solid, x, z, height, height));
      if (hit) {
        walled += 1;
        break;
      }
    }
  }
  return walled / directions;
}
