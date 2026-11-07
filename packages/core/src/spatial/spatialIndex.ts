import type { RenderBounds } from "../visibility/bounds";
import { aabbIntersects } from "../visibility/bounds";
import type { Frustum } from "../visibility/frustum";
import { aabbInFrustum } from "../visibility/frustum";

export interface SpatialIndexOptions {
  /** Grid cell size in world units. Default 16. Objects are hashed into every cell their AABB overlaps. */
  readonly cellSize?: number;
  /**
   * An object whose AABB spans more cells than this on any axis is parked in an "oversized"
   * bucket that every query visits, rather than smearing across the grid. Default 6.
   */
  readonly maxCellSpan?: number;
}

/** Integer cell bounds an object covers, inclusive on both ends. */
export interface SpatialCellRange {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
}

/**
 * Plain JSON state of a {@link SpatialIndex}. Cells keep the order they were created in and each cell
 * keeps its ids' order, so a restored index returns query results in the same order.
 */
export interface SpatialIndexState {
  /** Per object: its cell range (`null` when oversized) and whether it was inserted as dynamic. */
  entries: [id: string, range: SpatialCellRange | null, dynamic: boolean][];
  cells: [x: number, y: number, z: number, ids: string[]][];
  oversized: string[];
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
  /** Collect ids whose cells the box touches (broad phase). Clears and reuses `out`; allocates nothing once `out` has grown. */
  queryBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: string[]): string[];
  /** Collect ids whose cells the sphere's bounding box touches (broad phase). Clears and reuses `out`; allocates nothing once `out` has grown. */
  querySphere(cx: number, cy: number, cz: number, radius: number, out: string[]): string[];
  cells(): { key: string; count: number; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }[];
  cellSize(): number;
  clear(): void;
  snapshot(): SpatialIndexState;
  restore(next: SpatialIndexState): void;
}

const FLAG_LIVE = 1;
const FLAG_DYNAMIC = 2;
const FLAG_OVERSIZED = 4;
const NO_CELL = -1;

function grownFloat64(source: Float64Array, length: number): Float64Array<ArrayBuffer> {
  const next = new Float64Array(length);
  next.set(source);
  return next;
}

function grownInt32(source: Int32Array, length: number): Int32Array<ArrayBuffer> {
  const next = new Int32Array(length);
  next.set(source);
  return next;
}

function emptyTable(slots: number): Float64Array<ArrayBuffer> {
  const table = new Float64Array(slots * 4);
  for (let slot = 0; slot < slots; slot += 1) table[slot * 4 + 3] = NO_CELL;
  return table;
}

function hashCell(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77) ^ Math.imul(z | 0, 0xc2b2ae3d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h;
}

/**
 * A uniform 3D spatial hash over bounded ids: insert, move and remove them, then query a frustum, a
 * box or a sphere without scanning every entry. Ids map to integer handles and cells to numeric
 * keys inside, so moving an object and querying allocate nothing in steady state.
 *
 * @capability spatial-index broad-phase 3D hash for frustum, box and sphere queries over moving ids
 */
export function createSpatialIndex(options: SpatialIndexOptions = {}): SpatialIndex {
  const size = options.cellSize ?? 16;
  const maxSpan = options.maxCellSpan ?? 6;

  // Objects: string id -> handle; per-handle columns. The map keeps insertion order for snapshots.
  const handles = new Map<string, number>();
  let handleIds: string[] = [];
  let flags = new Uint8Array(16);
  let ranges = new Float64Array(16 * 6);
  let stamps = new Uint32Array(16);
  let freeHandles: number[] = [];
  let handleCount = 0;
  const oversized: number[] = [];

  // Cells: an open-addressing table whose slots hold [x, y, z, cell] inline, so a probe reads one cache
  // line; every cell's members live in one pooled Int32Array; creation order is a linked list.
  let cellCoords = new Float64Array(16 * 3);
  let cellPrev = new Int32Array(16);
  let cellNext = new Int32Array(16);
  let memberStart = new Int32Array(16);
  let memberCount = new Int32Array(16);
  let memberCap = new Int32Array(16);
  // A cell outgrowing its slice moves to a doubled one at the end; the old slice is left behind. Waste is
  // bounded by the caps themselves, and a freed cell keeps its slice for the next cell that takes its id.
  let pool = new Int32Array(64);
  let poolEnd = 0;
  let freeCells: number[] = [];
  let cellsAllocated = 0;
  let liveCells = 0;
  let firstCell = NO_CELL;
  let lastCell = NO_CELL;
  let table = emptyTable(32);
  let tableMask = 31;

  let queryStamp = 0;

  function newHandle(id: string): number {
    let handle = freeHandles.pop();
    if (handle === undefined) {
      handle = handleCount;
      handleCount += 1;
      if (handle >= flags.length) {
        const length = flags.length * 2;
        const nextFlags = new Uint8Array(length);
        nextFlags.set(flags);
        flags = nextFlags;
        ranges = grownFloat64(ranges, length * 6);
        const nextStamps = new Uint32Array(length);
        nextStamps.set(stamps);
        stamps = nextStamps;
      }
    }
    handleIds[handle] = id;
    stamps[handle] = 0;
    handles.set(id, handle);
    return handle;
  }

  function findCell(x: number, y: number, z: number): number {
    let slot = hashCell(x, y, z) & tableMask;
    for (;;) {
      const base = slot * 4;
      const cell = table[base + 3]!;
      if (cell === NO_CELL) return NO_CELL;
      if (table[base] === x && table[base + 1] === y && table[base + 2] === z) return cell;
      slot = (slot + 1) & tableMask;
    }
  }

  function placeInTable(cell: number, x: number, y: number, z: number): void {
    let slot = hashCell(x, y, z) & tableMask;
    while (table[slot * 4 + 3] !== NO_CELL) slot = (slot + 1) & tableMask;
    const base = slot * 4;
    table[base] = x;
    table[base + 1] = y;
    table[base + 2] = z;
    table[base + 3] = cell;
  }

  function growTable(): void {
    const slots = (tableMask + 1) * 2;
    table = emptyTable(slots);
    tableMask = slots - 1;
    for (let cell = firstCell; cell !== NO_CELL; cell = cellNext[cell]!) {
      placeInTable(cell, cellCoords[cell * 3]!, cellCoords[cell * 3 + 1]!, cellCoords[cell * 3 + 2]!);
    }
  }

  function createCell(x: number, y: number, z: number): number {
    let cell = freeCells.pop();
    if (cell === undefined) {
      cell = cellsAllocated;
      cellsAllocated += 1;
      if (cell >= cellPrev.length) {
        const length = cellPrev.length * 2;
        cellCoords = grownFloat64(cellCoords, length * 3);
        cellPrev = grownInt32(cellPrev, length);
        cellNext = grownInt32(cellNext, length);
        memberStart = grownInt32(memberStart, length);
        memberCount = grownInt32(memberCount, length);
        memberCap = grownInt32(memberCap, length);
      }
    }
    const base = cell * 3;
    cellCoords[base] = x;
    cellCoords[base + 1] = y;
    cellCoords[base + 2] = z;
    memberCount[cell] = 0;
    cellPrev[cell] = lastCell;
    cellNext[cell] = NO_CELL;
    if (lastCell === NO_CELL) firstCell = cell;
    else cellNext[lastCell] = cell;
    lastCell = cell;
    liveCells += 1;
    if (liveCells * 2 > tableMask + 1) growTable();
    else placeInTable(cell, x, y, z);
    return cell;
  }

  function deleteCell(cell: number): void {
    const x = cellCoords[cell * 3]!, y = cellCoords[cell * 3 + 1]!, z = cellCoords[cell * 3 + 2]!;
    let hole = hashCell(x, y, z) & tableMask;
    while (table[hole * 4 + 3] !== cell) hole = (hole + 1) & tableMask;
    table[hole * 4 + 3] = NO_CELL;
    // Backward-shift deletion keeps every probe chain unbroken without tombstones.
    let slot = hole;
    for (;;) {
      slot = (slot + 1) & tableMask;
      const from = slot * 4;
      if (table[from + 3] === NO_CELL) break;
      const home = hashCell(table[from]!, table[from + 1]!, table[from + 2]!) & tableMask;
      const between = hole <= slot ? home > hole && home <= slot : home > hole || home <= slot;
      if (between) continue;
      table.copyWithin(hole * 4, from, from + 4);
      table[from + 3] = NO_CELL;
      hole = slot;
    }
    const prev = cellPrev[cell]!;
    const next = cellNext[cell]!;
    if (prev === NO_CELL) firstCell = next;
    else cellNext[prev] = next;
    if (next === NO_CELL) lastCell = prev;
    else cellPrev[next] = prev;
    liveCells -= 1;
    freeCells.push(cell);
  }

  function addMember(cell: number, handle: number): void {
    const count = memberCount[cell]!;
    if (count === memberCap[cell]) {
      const cap = count === 0 ? 4 : count * 2;
      if (poolEnd + cap > pool.length) {
        const grown = new Int32Array(Math.max(pool.length * 2, poolEnd + cap));
        grown.set(pool.subarray(0, poolEnd));
        pool = grown;
      }
      const start = memberStart[cell]!;
      pool.copyWithin(poolEnd, start, start + count);
      memberStart[cell] = poolEnd;
      memberCap[cell] = cap;
      poolEnd += cap;
    }
    pool[memberStart[cell]! + count] = handle;
    memberCount[cell] = count + 1;
  }

  function addToCells(handle: number): void {
    const base = handle * 6;
    const x0 = ranges[base]!, y0 = ranges[base + 1]!, z0 = ranges[base + 2]!;
    const x1 = ranges[base + 3]!, y1 = ranges[base + 4]!, z1 = ranges[base + 5]!;
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (let z = z0; z <= z1; z += 1) {
          let cell = findCell(x, y, z);
          if (cell === NO_CELL) cell = createCell(x, y, z);
          addMember(cell, handle);
        }
      }
    }
  }

  function removeFromCells(handle: number): void {
    const base = handle * 6;
    const x0 = ranges[base]!, y0 = ranges[base + 1]!, z0 = ranges[base + 2]!;
    const x1 = ranges[base + 3]!, y1 = ranges[base + 4]!, z1 = ranges[base + 5]!;
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const cell = findCell(x, y, z);
          if (cell === NO_CELL) continue;
          const start = memberStart[cell]!;
          const last = start + memberCount[cell]! - 1;
          let at = start;
          while (at <= last && pool[at] !== handle) at += 1;
          if (at > last) continue;
          pool[at] = pool[last]!;
          memberCount[cell] = last - start;
          if (last === start) deleteCell(cell);
        }
      }
    }
  }

  function removeOversized(handle: number): void {
    const at = oversized.indexOf(handle);
    if (at >= 0) oversized.splice(at, 1);
  }

  function sameRange(handle: number, bounds: RenderBounds): boolean {
    const base = handle * 6;
    return (
      ranges[base] === Math.floor(bounds.minX / size) && ranges[base + 1] === Math.floor(bounds.minY / size) &&
      ranges[base + 2] === Math.floor(bounds.minZ / size) && ranges[base + 3] === Math.floor(bounds.maxX / size) &&
      ranges[base + 4] === Math.floor(bounds.maxY / size) && ranges[base + 5] === Math.floor(bounds.maxZ / size)
    );
  }

  function writeRange(handle: number, bounds: RenderBounds): void {
    const base = handle * 6;
    ranges[base] = Math.floor(bounds.minX / size);
    ranges[base + 1] = Math.floor(bounds.minY / size);
    ranges[base + 2] = Math.floor(bounds.minZ / size);
    ranges[base + 3] = Math.floor(bounds.maxX / size);
    ranges[base + 4] = Math.floor(bounds.maxY / size);
    ranges[base + 5] = Math.floor(bounds.maxZ / size);
  }

  function spanTooBig(handle: number): boolean {
    const base = handle * 6;
    return (
      ranges[base + 3]! - ranges[base]! > maxSpan ||
      ranges[base + 4]! - ranges[base + 1]! > maxSpan ||
      ranges[base + 5]! - ranges[base + 2]! > maxSpan
    );
  }

  function place(id: string, bounds: RenderBounds, dynamic: boolean): void {
    const handle = newHandle(id);
    writeRange(handle, bounds);
    if (spanTooBig(handle)) {
      flags[handle] = FLAG_LIVE | (dynamic ? FLAG_DYNAMIC : 0) | FLAG_OVERSIZED;
      oversized.push(handle);
      return;
    }
    flags[handle] = FLAG_LIVE | (dynamic ? FLAG_DYNAMIC : 0);
    addToCells(handle);
  }

  function nextStamp(): void {
    queryStamp += 1;
    if (queryStamp === 0xffffffff) {
      stamps.fill(0);
      queryStamp = 1;
    }
  }

  function collectCell(cell: number, out: string[]): void {
    for (let i = memberStart[cell]!, end = i + memberCount[cell]!; i < end; i += 1) {
      const handle = pool[i]!;
      if (stamps[handle] === queryStamp) continue;
      stamps[handle] = queryStamp;
      out.push(handleIds[handle]!);
    }
  }

  function collectOversized(out: string[]): void {
    for (let i = 0; i < oversized.length; i += 1) {
      const handle = oversized[i]!;
      if (stamps[handle] === queryStamp) continue;
      stamps[handle] = queryStamp;
      out.push(handleIds[handle]!);
    }
  }

  function cellVisible(frustum: Frustum | null, x: number, y: number, z: number): boolean {
    return frustum === null || aabbInFrustum(frustum, x * size, y * size, z * size, (x + 1) * size, (y + 1) * size, (z + 1) * size);
  }

  function collectBoxCells(
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number,
    out: string[],
    frustum: Frustum | null,
  ): void {
    nextStamp();
    out.length = 0;
    const x0 = Math.floor(minX / size), y0 = Math.floor(minY / size), z0 = Math.floor(minZ / size);
    const x1 = Math.floor(maxX / size), y1 = Math.floor(maxY / size), z1 = Math.floor(maxZ / size);
    const rangeCellCount = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    if (rangeCellCount > liveCells) {
      for (let cell = firstCell; cell !== NO_CELL; cell = cellNext[cell]!) {
        const base = cell * 3;
        const x = cellCoords[base]!, y = cellCoords[base + 1]!, z = cellCoords[base + 2]!;
        if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) continue;
        if (!cellVisible(frustum, x, y, z)) continue;
        collectCell(cell, out);
      }
    } else {
      for (let x = x0; x <= x1; x += 1) {
        for (let y = y0; y <= y1; y += 1) {
          for (let z = z0; z <= z1; z += 1) {
            if (!cellVisible(frustum, x, y, z)) continue;
            const cell = findCell(x, y, z);
            if (cell !== NO_CELL) collectCell(cell, out);
          }
        }
      }
    }
    if (oversized.length > 0) collectOversized(out);
  }

  function rangeOf(handle: number): SpatialCellRange {
    const base = handle * 6;
    return {
      x0: ranges[base]!, y0: ranges[base + 1]!, z0: ranges[base + 2]!,
      x1: ranges[base + 3]!, y1: ranges[base + 4]!, z1: ranges[base + 5]!,
    };
  }

  function clear(): void {
    handles.clear();
    handleIds = [];
    flags = new Uint8Array(16);
    ranges = new Float64Array(16 * 6);
    stamps = new Uint32Array(16);
    freeHandles = [];
    handleCount = 0;
    oversized.length = 0;
    cellCoords = new Float64Array(16 * 3);
    cellPrev = new Int32Array(16);
    cellNext = new Int32Array(16);
    memberStart = new Int32Array(16);
    memberCount = new Int32Array(16);
    memberCap = new Int32Array(16);
    pool = new Int32Array(64);
    poolEnd = 0;
    freeCells = [];
    cellsAllocated = 0;
    liveCells = 0;
    firstCell = NO_CELL;
    lastCell = NO_CELL;
    table = emptyTable(32);
    tableMask = 31;
    queryStamp = 0;
  }

  return {
    insert(id, bounds, dynamic = false) {
      if (handles.has(id)) {
        this.update(id, bounds);
        return;
      }
      place(id, bounds, dynamic);
    },
    update(id, bounds) {
      const handle = handles.get(id);
      if (handle === undefined) {
        place(id, bounds, true);
        return;
      }
      const wasOversized = (flags[handle]! & FLAG_OVERSIZED) !== 0;
      if (!wasOversized) {
        if (sameRange(handle, bounds)) return;
        removeFromCells(handle);
      }
      writeRange(handle, bounds);
      if (spanTooBig(handle)) {
        if (!wasOversized) {
          flags[handle] = flags[handle]! | FLAG_OVERSIZED;
          oversized.push(handle);
        }
        return;
      }
      if (wasOversized) {
        flags[handle] = flags[handle]! & ~FLAG_OVERSIZED;
        removeOversized(handle);
      }
      addToCells(handle);
    },
    remove(id) {
      const handle = handles.get(id);
      if (handle === undefined) return;
      if ((flags[handle]! & FLAG_OVERSIZED) !== 0) removeOversized(handle);
      else removeFromCells(handle);
      flags[handle] = 0;
      handles.delete(id);
      handleIds[handle] = "";
      freeHandles.push(handle);
    },
    has(id) {
      return handles.has(id);
    },
    size() {
      return handles.size;
    },
    queryFrustum(frustum, out) {
      collectBoxCells(frustum.minX, frustum.minY, frustum.minZ, frustum.maxX, frustum.maxY, frustum.maxZ, out, frustum);
      return out;
    },
    queryBox(minX, minY, minZ, maxX, maxY, maxZ, out) {
      collectBoxCells(minX, minY, minZ, maxX, maxY, maxZ, out, null);
      return out;
    },
    querySphere(cx, cy, cz, radius, out) {
      collectBoxCells(cx - radius, cy - radius, cz - radius, cx + radius, cy + radius, cz + radius, out, null);
      return out;
    },
    cells() {
      const result: { key: string; count: number; minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }[] = [];
      for (let cell = firstCell; cell !== NO_CELL; cell = cellNext[cell]!) {
        const base = cell * 3;
        const x = cellCoords[base]!, y = cellCoords[base + 1]!, z = cellCoords[base + 2]!;
        result.push({
          key: `${x}:${y}:${z}`,
          count: memberCount[cell]!,
          minX: x * size, minY: y * size, minZ: z * size,
          maxX: (x + 1) * size, maxY: (y + 1) * size, maxZ: (z + 1) * size,
        });
      }
      return result;
    },
    cellSize() {
      return size;
    },
    clear,
    snapshot() {
      const entries: SpatialIndexState["entries"] = [];
      for (const [id, handle] of handles) {
        const flag = flags[handle]!;
        entries.push([id, (flag & FLAG_OVERSIZED) !== 0 ? null : rangeOf(handle), (flag & FLAG_DYNAMIC) !== 0]);
      }
      const cells: SpatialIndexState["cells"] = [];
      for (let cell = firstCell; cell !== NO_CELL; cell = cellNext[cell]!) {
        const base = cell * 3;
        const ids: string[] = [];
        for (let i = memberStart[cell]!, end = i + memberCount[cell]!; i < end; i += 1) ids.push(handleIds[pool[i]!]!);
        cells.push([cellCoords[base]!, cellCoords[base + 1]!, cellCoords[base + 2]!, ids]);
      }
      return { entries, cells, oversized: oversized.map((handle) => handleIds[handle]!) };
    },
    restore(next) {
      clear();
      for (const [id, range, dynamic] of next.entries) {
        const handle = newHandle(id);
        const base = handle * 6;
        if (range === null) ranges.fill(Number.NaN, base, base + 6);
        else {
          ranges[base] = range.x0; ranges[base + 1] = range.y0; ranges[base + 2] = range.z0;
          ranges[base + 3] = range.x1; ranges[base + 4] = range.y1; ranges[base + 5] = range.z1;
        }
        flags[handle] = FLAG_LIVE | (dynamic ? FLAG_DYNAMIC : 0) | (range === null ? FLAG_OVERSIZED : 0);
      }
      for (const [x, y, z, ids] of next.cells) {
        const cell = createCell(x, y, z);
        for (const id of ids) {
          const handle = handles.get(id);
          if (handle !== undefined) addMember(cell, handle);
        }
      }
      for (const id of next.oversized) {
        const handle = handles.get(id);
        if (handle !== undefined) oversized.push(handle);
      }
    },
  };
}

/** Precise AABB-vs-AABB test re-exported for callers refining a broad-phase result. */
export { aabbIntersects };
