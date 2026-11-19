/**
 * A flat XZ grid over points, rebuilt from scratch each tick by counting sort: the neighbour search for
 * systems that move every point every tick (crowds, flocks, a server kernel), where keeping a hash up to
 * date per move costs more than rebuilding. Cells sit on absolute `floor(x / cellSize)` boundaries and
 * points within a cell keep their input order, so a query visits candidates rows-of-z first, then x,
 * then input order: the same order a per-cell bucket walk gives.
 */
export interface PointGrid {
  rebuild(positions: ArrayLike<number>, items: ArrayLike<number> | number, count?: number): void;
  query(x: number, z: number, radius: number, out: Int32Array): number;
  size(): number;
}

export interface PointGridOptions {
  cellSize: number;
  /**
   * Most cells a rebuild may lay out, as a multiple of the point count (default 4). A population spread
   * thinner than this uses wider cells instead of a huge, mostly empty table; queries stay correct.
   */
  maxCellsPerPoint?: number;
}

/** @capability point-grid per-tick counting-sort neighbour grid over typed-array positions, allocation-free once warm */
export function createPointGrid(options: PointGridOptions): PointGrid {
  const baseCell = options.cellSize > 0 ? options.cellSize : 1;
  const cellsPerPoint = options.maxCellsPerPoint ?? 4;
  let cellStart = new Int32Array(17);
  let fill = new Int32Array(16);
  let cellOf = new Int32Array(16);
  let sorted = new Int32Array(16);
  let points = 0;
  let cell = baseCell;
  let originX = 0;
  let originZ = 0;
  let cols = 1;
  let rows = 1;

  function rebuild(positions: ArrayLike<number>, items: ArrayLike<number> | number, count?: number): void {
    const indexed = typeof items !== "number";
    const n = indexed ? Math.min(count ?? items.length, items.length) : items;
    points = n;
    if (sorted.length < n) {
      sorted = new Int32Array(n);
      cellOf = new Int32Array(n);
    }
    if (n === 0) {
      cols = rows = 1;
      cellStart[0] = cellStart[1] = 0;
      return;
    }
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const b = (indexed ? items[i]! : i) * 3;
      const x = positions[b]!, z = positions[b + 2]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    cell = baseCell;
    const budget = Math.max(16, n * cellsPerPoint);
    for (;;) {
      originX = Math.floor(minX / cell) * cell;
      originZ = Math.floor(minZ / cell) * cell;
      cols = Math.floor(maxX / cell) - Math.floor(minX / cell) + 1;
      rows = Math.floor(maxZ / cell) - Math.floor(minZ / cell) + 1;
      if (cols * rows <= budget && Number.isFinite(cols * rows)) break;
      cell *= 2;
    }
    const cells = cols * rows;
    if (cellStart.length < cells + 1) {
      cellStart = new Int32Array(cells + 1);
      fill = new Int32Array(cells);
    } else cellStart.fill(0, 0, cells + 1);
    const minCx = Math.floor(minX / cell), minCz = Math.floor(minZ / cell);
    for (let i = 0; i < n; i += 1) {
      const b = (indexed ? items[i]! : i) * 3;
      const c = (Math.floor(positions[b + 2]! / cell) - minCz) * cols + (Math.floor(positions[b]! / cell) - minCx);
      cellOf[i] = c;
      cellStart[c + 1] = cellStart[c + 1]! + 1;
    }
    for (let c = 0; c < cells; c += 1) {
      cellStart[c + 1] = cellStart[c + 1]! + cellStart[c]!;
      fill[c] = cellStart[c]!;
    }
    for (let i = 0; i < n; i += 1) {
      const c = cellOf[i]!;
      sorted[fill[c]!] = indexed ? items[i]! : i;
      fill[c] = fill[c]! + 1;
    }
  }

  function query(x: number, z: number, radius: number, out: Int32Array): number {
    if (points === 0) return 0;
    const minCx = Math.round(originX / cell), minCz = Math.round(originZ / cell);
    const cx0 = Math.max(0, Math.floor((x - radius) / cell) - minCx);
    const cx1 = Math.min(cols - 1, Math.floor((x + radius) / cell) - minCx);
    const cz0 = Math.max(0, Math.floor((z - radius) / cell) - minCz);
    const cz1 = Math.min(rows - 1, Math.floor((z + radius) / cell) - minCz);
    let written = 0;
    const limit = out.length;
    for (let cz = cz0; cz <= cz1; cz += 1) {
      const row = cz * cols;
      for (let k = cellStart[row + cx0]!, end = cellStart[row + cx1 + 1]!; k < end; k += 1) {
        if (written === limit) return written;
        out[written] = sorted[k]!;
        written += 1;
      }
    }
    return written;
  }

  return { rebuild, query, size: () => points };
}
