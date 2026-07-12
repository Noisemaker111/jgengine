import type { RenderBounds } from "./bounds";
import { aabbIntersects } from "./bounds";
import type { Frustum } from "./frustum";
import { aabbInFrustum } from "./frustum";

export interface SpatialIndexOptions {
  /** Grid cell size in world units. Default 16. Objects are hashed into every cell their AABB overlaps. */
  readonly cellSize?: number;
  /**
   * An object whose AABB spans more cells than this on any axis is parked in an "oversized"
   * bucket that every query visits, rather than smearing across the grid. Default 6.
   */
  readonly maxCellSpan?: number;
}

/**
 * A uniform 3D spatial hash the renderer and streaming system query for potentially-visible
 * objects instead of scanning the whole scene. Objects are keyed by their world AABB into
 * every overlapping cell; a moving object only rewrites the cells that actually changed.
 * Static objects are inserted once and never touched again. Oversized objects (huge terrain
 * chunks, world bounds) are held separately so they are always considered.
 */
export interface SpatialIndex {
  insert(id: string, bounds: RenderBounds, dynamic?: boolean): void;
  update(id: string, bounds: RenderBounds): void;
  remove(id: string): void;
  has(id: string): boolean;
  size(): number;
  /** Collect ids whose cells the frustum's world-AABB touches (broad phase). Reuses `out`. */
  queryFrustum(frustum: Frustum, out: string[]): string[];
  queryBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: string[]): string[];
  querySphere(cx: number, cy: number, cz: number, radius: number, out: string[]): string[];
  cells(): { key: string; count: number; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }[];
  cellSize(): number;
  clear(): void;
}

interface CellRange {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
}

interface Entry {
  range: CellRange | null; // null when oversized
  dynamic: boolean;
}

function cellOf(value: number, size: number): number {
  return Math.floor(value / size);
}

function packCell(x: number, y: number, z: number): string {
  return `${x}:${y}:${z}`;
}

interface CellBucket {
  x: number;
  y: number;
  z: number;
  ids: Set<string>;
}

export function createSpatialIndex(options: SpatialIndexOptions = {}): SpatialIndex {
  const size = options.cellSize ?? 16;
  const maxSpan = options.maxCellSpan ?? 6;
  const cells = new Map<string, CellBucket>();
  const oversized = new Set<string>();
  const entries = new Map<string, Entry>();

  // Allocation-free dedup for queries: an id is "seen" for query N when stamps.get(id) === N.
  const stamps = new Map<string, number>();
  let queryStamp = 0;

  function rangeOf(bounds: RenderBounds): CellRange {
    return {
      x0: cellOf(bounds.minX, size), y0: cellOf(bounds.minY, size), z0: cellOf(bounds.minZ, size),
      x1: cellOf(bounds.maxX, size), y1: cellOf(bounds.maxY, size), z1: cellOf(bounds.maxZ, size),
    };
  }

  function spanTooBig(range: CellRange): boolean {
    return (
      range.x1 - range.x0 > maxSpan ||
      range.y1 - range.y0 > maxSpan ||
      range.z1 - range.z0 > maxSpan
    );
  }

  function addToCells(id: string, range: CellRange): void {
    for (let x = range.x0; x <= range.x1; x += 1) {
      for (let y = range.y0; y <= range.y1; y += 1) {
        for (let z = range.z0; z <= range.z1; z += 1) {
          const key = packCell(x, y, z);
          let bucket = cells.get(key);
          if (bucket === undefined) {
            bucket = { x, y, z, ids: new Set() };
            cells.set(key, bucket);
          }
          bucket.ids.add(id);
        }
      }
    }
  }

  function removeFromCells(id: string, range: CellRange): void {
    for (let x = range.x0; x <= range.x1; x += 1) {
      for (let y = range.y0; y <= range.y1; y += 1) {
        for (let z = range.z0; z <= range.z1; z += 1) {
          const key = packCell(x, y, z);
          const bucket = cells.get(key);
          if (bucket === undefined) continue;
          bucket.ids.delete(id);
          if (bucket.ids.size === 0) cells.delete(key);
        }
      }
    }
  }

  function rangesEqual(a: CellRange, b: CellRange): boolean {
    return a.x0 === b.x0 && a.y0 === b.y0 && a.z0 === b.z0 && a.x1 === b.x1 && a.y1 === b.y1 && a.z1 === b.z1;
  }

  function place(id: string, bounds: RenderBounds, dynamic: boolean): void {
    const range = rangeOf(bounds);
    if (spanTooBig(range)) {
      oversized.add(id);
      entries.set(id, { range: null, dynamic });
      return;
    }
    addToCells(id, range);
    entries.set(id, { range, dynamic });
  }

  function collectBucket(bucket: CellBucket, out: string[]): void {
    for (const id of bucket.ids) {
      if (stamps.get(id) === queryStamp) continue;
      stamps.set(id, queryStamp);
      out.push(id);
    }
  }

  function collectCell(key: string, out: string[]): void {
    const bucket = cells.get(key);
    if (bucket === undefined) return;
    collectBucket(bucket, out);
  }

  function collectOversized(out: string[]): void {
    for (const id of oversized) {
      if (stamps.get(id) === queryStamp) continue;
      stamps.set(id, queryStamp);
      out.push(id);
    }
  }

  function collectBoxCells(
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
    out: string[],
    cellFilter?: (x: number, y: number, z: number) => boolean,
  ): void {
    queryStamp += 1;
    out.length = 0;
    const x0 = cellOf(minX, size), y0 = cellOf(minY, size), z0 = cellOf(minZ, size);
    const x1 = cellOf(maxX, size), y1 = cellOf(maxY, size), z1 = cellOf(maxZ, size);
    const rangeCellCount = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    if (rangeCellCount > cells.size) {
      for (const bucket of cells.values()) {
        if (bucket.x < x0 || bucket.x > x1 || bucket.y < y0 || bucket.y > y1 || bucket.z < z0 || bucket.z > z1) {
          continue;
        }
        if (cellFilter !== undefined && !cellFilter(bucket.x, bucket.y, bucket.z)) continue;
        collectBucket(bucket, out);
      }
    } else {
      for (let x = x0; x <= x1; x += 1) {
        for (let y = y0; y <= y1; y += 1) {
          for (let z = z0; z <= z1; z += 1) {
            if (cellFilter !== undefined && !cellFilter(x, y, z)) continue;
            collectCell(packCell(x, y, z), out);
          }
        }
      }
    }
    collectOversized(out);
  }

  return {
    insert(id, bounds, dynamic = false) {
      const existing = entries.get(id);
      if (existing !== undefined) {
        this.update(id, bounds);
        return;
      }
      place(id, bounds, dynamic);
    },
    update(id, bounds) {
      const existing = entries.get(id);
      if (existing === undefined) {
        place(id, bounds, true);
        return;
      }
      const range = rangeOf(bounds);
      const tooBig = spanTooBig(range);
      if (tooBig) {
        if (existing.range !== null) removeFromCells(id, existing.range);
        oversized.add(id);
        existing.range = null;
        return;
      }
      if (existing.range === null) {
        oversized.delete(id);
        addToCells(id, range);
        existing.range = range;
        return;
      }
      if (rangesEqual(existing.range, range)) return;
      removeFromCells(id, existing.range);
      addToCells(id, range);
      existing.range = range;
    },
    remove(id) {
      const existing = entries.get(id);
      if (existing === undefined) return;
      if (existing.range === null) oversized.delete(id);
      else removeFromCells(id, existing.range);
      entries.delete(id);
      stamps.delete(id);
    },
    has(id) {
      return entries.has(id);
    },
    size() {
      return entries.size;
    },
    queryFrustum(frustum, out) {
      collectBoxCells(
        frustum.minX, frustum.minY, frustum.minZ,
        frustum.maxX, frustum.maxY, frustum.maxZ,
        out,
        (x, y, z) => aabbInFrustum(
          frustum,
          x * size, y * size, z * size,
          (x + 1) * size, (y + 1) * size, (z + 1) * size,
        ),
      );
      return out;
    },
    queryBox(minX, minY, minZ, maxX, maxY, maxZ, out) {
      collectBoxCells(minX, minY, minZ, maxX, maxY, maxZ, out);
      return out;
    },
    querySphere(cx, cy, cz, radius, out) {
      collectBoxCells(cx - radius, cy - radius, cz - radius, cx + radius, cy + radius, cz + radius, out);
      return out;
    },
    cells() {
      const result: { key: string; count: number; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }[] = [];
      for (const [key, bucket] of cells) {
        result.push({
          key,
          count: bucket.ids.size,
          minX: bucket.x * size, minY: bucket.y * size, minZ: bucket.z * size,
          maxX: (bucket.x + 1) * size, maxY: (bucket.y + 1) * size, maxZ: (bucket.z + 1) * size,
        });
      }
      return result;
    },
    cellSize() {
      return size;
    },
    clear() {
      cells.clear();
      oversized.clear();
      entries.clear();
      stamps.clear();
    },
  };
}

/** Precise AABB-vs-AABB test re-exported for callers refining a broad-phase result. */
export { aabbIntersects };
