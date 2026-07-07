import type { PhysicsBounds } from "./physicsWorld";

export interface SpatialGridConfig {
  /** Horizontal extent to index; only x/z of the bounds are used (a top-down plane). */
  bounds: PhysicsBounds;
  /** Cell edge; tune to ≈ the query/contact radius so a hit touches ≤ 4 cells. */
  cellSize: number;
  /** Maximum entities the index holds; fixed at construction. */
  capacity: number;
}

/**
 * A uniform-grid broad-phase over the x/z plane, separate from the rigid-body sim, for cheap
 * same-tick proximity across hundreds–thousands of simple movers (swarm enemies). Rebuild each
 * tick from the caller's own position arrays, then `queryCircle` (enemies hitting the player / an
 * AoE) or `forEachPair` (mutual separation). Both are precise: no false negatives, no false
 * positives beyond the exact distance test.
 */
export class SpatialGrid {
  readonly cellSize: number;
  readonly nx: number;
  readonly nz: number;
  readonly capacity: number;

  private readonly minX: number;
  private readonly minZ: number;
  private readonly numCells: number;
  private readonly cellStart: Int32Array;
  private readonly cursor: Int32Array;
  private readonly sorted: Int32Array;
  private readonly cellOfBody: Int32Array;
  private xs: Float32Array | null = null;
  private zs: Float32Array | null = null;
  private entityCount = 0;

  constructor(config: SpatialGridConfig) {
    this.cellSize = config.cellSize;
    this.capacity = config.capacity;
    this.minX = config.bounds.min[0];
    this.minZ = config.bounds.min[2];
    const spanX = Math.max(config.bounds.max[0] - config.bounds.min[0], config.cellSize);
    const spanZ = Math.max(config.bounds.max[2] - config.bounds.min[2], config.cellSize);
    this.nx = Math.max(1, Math.ceil(spanX / config.cellSize));
    this.nz = Math.max(1, Math.ceil(spanZ / config.cellSize));
    this.numCells = this.nx * this.nz;
    this.cellStart = new Int32Array(this.numCells + 1);
    this.cursor = new Int32Array(this.numCells);
    this.sorted = new Int32Array(config.capacity);
    this.cellOfBody = new Int32Array(config.capacity);
  }

  get count(): number {
    return this.entityCount;
  }

  private cellX(x: number): number {
    const raw = Math.floor((x - this.minX) / this.cellSize);
    return raw < 0 ? 0 : raw >= this.nx ? this.nx - 1 : raw;
  }

  private cellZ(z: number): number {
    const raw = Math.floor((z - this.minZ) / this.cellSize);
    return raw < 0 ? 0 : raw >= this.nz ? this.nz - 1 : raw;
  }

  rebuild(count: number, xs: Float32Array, zs: Float32Array): void {
    this.entityCount = count;
    this.xs = xs;
    this.zs = zs;
    const start = this.cellStart;
    start.fill(0);
    for (let i = 0; i < count; i += 1) {
      const c = this.cellZ(zs[i]!) * this.nx + this.cellX(xs[i]!);
      this.cellOfBody[i] = c;
      start[c + 1]! += 1;
    }
    for (let c = 0; c < this.numCells; c += 1) {
      start[c + 1]! += start[c]!;
      this.cursor[c] = start[c]!;
    }
    for (let i = 0; i < count; i += 1) {
      const c = this.cellOfBody[i]!;
      this.sorted[this.cursor[c]!++] = i;
    }
  }

  /** Fill `out` with every entity within `radius` of (x,z); returns the hit count (capped at `out.length`). */
  queryCircle(x: number, z: number, radius: number, out: Int32Array): number {
    const xs = this.xs;
    const zs = this.zs;
    if (xs === null || zs === null) return 0;
    const r2 = radius * radius;
    const cxMin = this.cellX(x - radius);
    const cxMax = this.cellX(x + radius);
    const czMin = this.cellZ(z - radius);
    const czMax = this.cellZ(z + radius);
    const limit = out.length;
    let n = 0;
    for (let cz = czMin; cz <= czMax; cz += 1) {
      const rowBase = cz * this.nx;
      for (let cx = cxMin; cx <= cxMax; cx += 1) {
        const cell = rowBase + cx;
        const end = this.cellStart[cell + 1]!;
        for (let s = this.cellStart[cell]!; s < end; s += 1) {
          const id = this.sorted[s]!;
          const dx = xs[id]! - x;
          const dz = zs[id]! - z;
          if (dx * dx + dz * dz <= r2) {
            if (n >= limit) return n;
            out[n++] = id;
          }
        }
      }
    }
    return n;
  }

  /** Invoke `cb(a, b)` once for each unordered pair within `maxDistance` (mutual separation/overlap). */
  forEachPair(maxDistance: number, cb: (a: number, b: number) => void): void {
    const xs = this.xs;
    const zs = this.zs;
    if (xs === null || zs === null) return;
    const d2 = maxDistance * maxDistance;
    const nx = this.nx;
    const nz = this.nz;
    for (let i = 0; i < this.entityCount; i += 1) {
      const c = this.cellOfBody[i]!;
      const cz = (c / nx) | 0;
      const cx = c - cz * nx;
      const x = xs[i]!;
      const z = zs[i]!;
      const z0 = cz > 0 ? cz - 1 : cz;
      const z1 = cz < nz - 1 ? cz + 1 : cz;
      const x0 = cx > 0 ? cx - 1 : cx;
      const x1 = cx < nx - 1 ? cx + 1 : cx;
      for (let gz = z0; gz <= z1; gz += 1) {
        const rowBase = gz * nx;
        for (let gx = x0; gx <= x1; gx += 1) {
          const cell = rowBase + gx;
          const end = this.cellStart[cell + 1]!;
          for (let s = this.cellStart[cell]!; s < end; s += 1) {
            const j = this.sorted[s]!;
            if (j <= i) continue;
            const dx = xs[j]! - x;
            const dz = zs[j]! - z;
            if (dx * dx + dz * dz <= d2) cb(i, j);
          }
        }
      }
    }
  }
}
