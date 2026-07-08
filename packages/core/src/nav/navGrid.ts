import type { Aabb } from "../world/geometry";

export type NavPoint = readonly [number, number];

export interface NavGridConfig {
  bounds: Aabb;
  cellSize: number;
  /** Allow 8-neighbour movement (no corner cutting). Default true. */
  diagonal?: boolean;
}

export interface NavCell {
  col: number;
  row: number;
}

export interface FindPathOptions {
  /** String-pull the raw grid path into straight runs where line-of-sight is clear. Default true. */
  smooth?: boolean;
  /** Diameter of the mover in world units — blocks cells within this margin of an obstacle. Default 0. */
  clearance?: number;
  /** Multiplier (>=1) applied to the base cost of stepping from one cell center to a neighbour's. Use to penalize slopes, terrain, etc. */
  stepCost?: (from: NavPoint, to: NavPoint) => number;
}

export interface NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly bounds: Aabb;
  readonly diagonal: boolean;
  isWalkable(col: number, row: number): boolean;
  setWalkable(col: number, row: number, walkable: boolean): void;
  blockAabb(aabb: Aabb): void;
  clearAabb(aabb: Aabb): void;
  reset(walkable: boolean): void;
  inBounds(col: number, row: number): boolean;
  cellAt(point: NavPoint): NavCell;
  center(col: number, row: number): NavPoint;
  /** Nearest walkable cell to a point (spiral search); null if the whole grid is blocked. */
  nearestWalkable(point: NavPoint): NavCell | null;
  /** Unobstructed straight line between two world points (supercover cell walk). */
  lineOfSight(from: NavPoint, to: NavPoint): boolean;
}

const SQRT2 = Math.SQRT2;

function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function createNavGrid(config: NavGridConfig): NavGrid {
  const { bounds, cellSize } = config;
  if (!(cellSize > 0)) throw new Error("navGrid cellSize must be positive.");
  const diagonal = config.diagonal ?? true;
  const width = Math.max(bounds.maxX - bounds.minX, cellSize);
  const depth = Math.max(bounds.maxZ - bounds.minZ, cellSize);
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(depth / cellSize));
  const walkable = new Uint8Array(cols * rows).fill(1);

  const index = (col: number, row: number) => row * cols + col;
  const inBounds = (col: number, row: number) => col >= 0 && col < cols && row >= 0 && row < rows;

  function cellAt(point: NavPoint): NavCell {
    return {
      col: clampInt(Math.floor((point[0] - bounds.minX) / cellSize), 0, cols - 1),
      row: clampInt(Math.floor((point[1] - bounds.minZ) / cellSize), 0, rows - 1),
    };
  }

  function center(col: number, row: number): NavPoint {
    return [bounds.minX + (col + 0.5) * cellSize, bounds.minZ + (row + 0.5) * cellSize];
  }

  function markAabb(aabb: Aabb, value: number): void {
    const min = cellAt([aabb.minX, aabb.minZ]);
    const max = cellAt([aabb.maxX, aabb.maxZ]);
    for (let row = min.row; row <= max.row; row += 1) {
      for (let col = min.col; col <= max.col; col += 1) walkable[index(col, row)] = value;
    }
  }

  const grid: NavGrid = {
    cols,
    rows,
    cellSize,
    bounds,
    diagonal,
    isWalkable: (col, row) => inBounds(col, row) && walkable[index(col, row)] === 1,
    setWalkable(col, row, next) {
      if (inBounds(col, row)) walkable[index(col, row)] = next ? 1 : 0;
    },
    blockAabb: (aabb) => markAabb(aabb, 0),
    clearAabb: (aabb) => markAabb(aabb, 1),
    reset: (next) => walkable.fill(next ? 1 : 0),
    inBounds,
    cellAt,
    center,
    nearestWalkable(point) {
      const start = cellAt(point);
      if (walkable[index(start.col, start.row)] === 1) return start;
      const maxRadius = Math.max(cols, rows);
      for (let radius = 1; radius <= maxRadius; radius += 1) {
        for (let row = start.row - radius; row <= start.row + radius; row += 1) {
          for (let col = start.col - radius; col <= start.col + radius; col += 1) {
            const onRing = Math.abs(col - start.col) === radius || Math.abs(row - start.row) === radius;
            if (!onRing || !inBounds(col, row)) continue;
            if (walkable[index(col, row)] === 1) return { col, row };
          }
        }
      }
      return null;
    },
    lineOfSight(from, to) {
      const a = cellAt(from);
      const b = cellAt(to);
      let x = a.col;
      let y = a.row;
      const dx = Math.abs(b.col - a.col);
      const dy = Math.abs(b.row - a.row);
      const sx = a.col < b.col ? 1 : -1;
      const sy = a.row < b.row ? 1 : -1;
      let err = dx - dy;
      for (;;) {
        if (walkable[index(x, y)] === 0) return false;
        if (x === b.col && y === b.row) return true;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x += sx;
        }
        if (e2 < dx) {
          err += dx;
          y += sy;
        }
      }
    },
  };
  return grid;
}

interface HeapNode {
  key: number;
  f: number;
}

function heapPush(heap: HeapNode[], node: HeapNode): void {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent]!.f <= heap[i]!.f) break;
    [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
    i = parent;
  }
}

function heapPop(heap: HeapNode[]): HeapNode | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0 && last !== undefined) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < heap.length && heap[left]!.f < heap[smallest]!.f) smallest = left;
      if (right < heap.length && heap[right]!.f < heap[smallest]!.f) smallest = right;
      if (smallest === i) break;
      [heap[smallest], heap[i]] = [heap[i]!, heap[smallest]!];
      i = smallest;
    }
  }
  return top;
}

function withClearance(grid: NavGrid, clearance: number): (col: number, row: number) => boolean {
  if (!(clearance > 0)) return (col, row) => grid.isWalkable(col, row);
  const pad = Math.max(0, Math.ceil(clearance / grid.cellSize / 2));
  return (col, row) => {
    for (let dy = -pad; dy <= pad; dy += 1) {
      for (let dx = -pad; dx <= pad; dx += 1) {
        if (!grid.isWalkable(col + dx, row + dy)) return false;
      }
    }
    return true;
  };
}

/**
 * A* over the walkable grid. Returns a polyline of world-space `[x, z]` waypoints
 * from `from` to `to`, or `null` when no route exists. Blocked start/goal snap to
 * the nearest walkable cell so a click on an obstacle still routes to its edge.
 */
export function findPath(
  grid: NavGrid,
  from: NavPoint,
  to: NavPoint,
  options: FindPathOptions = {},
): NavPoint[] | null {
  const passable = withClearance(grid, options.clearance ?? 0);
  const stepCost = options.stepCost;
  const startCell = grid.cellAt(from);
  const goalCell = grid.cellAt(to);
  const start = passable(startCell.col, startCell.row) ? startCell : grid.nearestWalkable(from);
  const goal = passable(goalCell.col, goalCell.row) ? goalCell : grid.nearestWalkable(to);
  if (start === null || goal === null) return null;

  const cols = grid.cols;
  const keyOf = (col: number, row: number) => row * cols + col;
  const startKey = keyOf(start.col, start.row);
  const goalKey = keyOf(goal.col, goal.row);

  const gScore = new Map<number, number>([[startKey, 0]]);
  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const heap: HeapNode[] = [];

  const heuristic = (col: number, row: number) => {
    const dc = Math.abs(col - goal.col);
    const dr = Math.abs(row - goal.row);
    return grid.diagonal ? dc + dr + (SQRT2 - 2) * Math.min(dc, dr) : dc + dr;
  };
  heapPush(heap, { key: startKey, f: heuristic(start.col, start.row) });

  const neighbours: readonly (readonly [number, number, number])[] = grid.diagonal
    ? [
        [1, 0, 1],
        [-1, 0, 1],
        [0, 1, 1],
        [0, -1, 1],
        [1, 1, SQRT2],
        [1, -1, SQRT2],
        [-1, 1, SQRT2],
        [-1, -1, SQRT2],
      ]
    : [
        [1, 0, 1],
        [-1, 0, 1],
        [0, 1, 1],
        [0, -1, 1],
      ];

  let found = false;
  while (heap.length > 0) {
    const current = heapPop(heap)!;
    if (closed.has(current.key)) continue;
    if (current.key === goalKey) {
      found = true;
      break;
    }
    closed.add(current.key);
    const col = current.key % cols;
    const row = (current.key - col) / cols;
    const g = gScore.get(current.key)!;
    for (const [dx, dy, step] of neighbours) {
      const nc = col + dx;
      const nr = row + dy;
      if (!passable(nc, nr)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(col + dx, row) || !passable(col, row + dy))) continue;
      const nKey = keyOf(nc, nr);
      if (closed.has(nKey)) continue;
      const multiplier = stepCost === undefined ? 1 : Math.max(1, stepCost(grid.center(col, row), grid.center(nc, nr)));
      const tentative = g + step * multiplier;
      if (tentative < (gScore.get(nKey) ?? Number.POSITIVE_INFINITY)) {
        gScore.set(nKey, tentative);
        cameFrom.set(nKey, current.key);
        heapPush(heap, { key: nKey, f: tentative + heuristic(nc, nr) });
      }
    }
  }

  if (!found) return null;

  const cells: NavCell[] = [];
  let cursor: number | undefined = goalKey;
  while (cursor !== undefined) {
    const col = cursor % cols;
    cells.unshift({ col, row: (cursor - col) / cols });
    cursor = cameFrom.get(cursor);
  }

  const raw: NavPoint[] = cells.map((cell) => grid.center(cell.col, cell.row));
  if (passable(goalCell.col, goalCell.row)) raw[raw.length - 1] = [to[0], to[1]];
  return options.smooth === false ? raw : smoothPath(grid, raw);
}

const DEFAULT_SLOPE_STEP_WEIGHT = 1;

/**
 * `FindPathOptions.stepCost` factory that penalizes steep terrain: cost is
 * `1 + weight * |Δheight| / horizontalDistance`, so with the default weight a
 * 45° slope roughly doubles the step cost.
 */
export function slopeStepCost(
  field: { sampleHeight(x: number, z: number): number },
  weight = DEFAULT_SLOPE_STEP_WEIGHT,
): (from: NavPoint, to: NavPoint) => number {
  return (from, to) => {
    const horizontal = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (horizontal < 1e-6) return 1;
    const rise = field.sampleHeight(to[0], to[1]) - field.sampleHeight(from[0], from[1]);
    return 1 + (weight * Math.abs(rise)) / horizontal;
  };
}

/** Remove waypoints the mover can skip because it has clear line-of-sight past them. */
export function smoothPath(grid: NavGrid, points: readonly NavPoint[]): NavPoint[] {
  if (points.length <= 2) return points.slice();
  const result: NavPoint[] = [points[0]!];
  let anchor = 0;
  for (let i = 2; i < points.length; i += 1) {
    if (!grid.lineOfSight(points[anchor]!, points[i]!)) {
      result.push(points[i - 1]!);
      anchor = i - 1;
    }
  }
  result.push(points[points.length - 1]!);
  return result;
}
