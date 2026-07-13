export type Cell = readonly [number, number];
export type Footprint = readonly Cell[];
export type Rotation = 0 | 1 | 2 | 3;

export interface ShapedItem<T> {
  id: string;
  value: T;
  footprint: Footprint;
}

export interface Placement<T> {
  id: string;
  value: T;
  footprint: Footprint;
  origin: Cell;
  rotation: Rotation;
}

export interface ShapedGrid<T> {
  readonly width: number;
  readonly height: number;
  readonly placements: readonly Placement<T>[];
}

export type ShapedRejection = "out-of-bounds" | "overlap" | "duplicate-id" | "unknown-id";

export interface ShapedPlaceResult<T> {
  status: "ok";
  grid: ShapedGrid<T>;
}
export interface ShapedRejected {
  status: "rejected";
  reason: ShapedRejection;
  detail?: string;
}
export type ShapedResult<T> = ShapedPlaceResult<T> | ShapedRejected;

function cellKey(cell: Cell): string {
  return `${cell[0]},${cell[1]}`;
}

export function normalizeFootprint(footprint: Footprint): Footprint {
  if (footprint.length === 0) return [];
  let minC = Infinity;
  let minR = Infinity;
  for (const [c, r] of footprint) {
    if (c < minC) minC = c;
    if (r < minR) minR = r;
  }
  const shifted = footprint.map(([c, r]): Cell => [c - minC, r - minR]);
  shifted.sort((a, b) => (a[1] === b[1] ? a[0] - b[0] : a[1] - b[1]));
  const seen = new Set<string>();
  const out: Cell[] = [];
  for (const cell of shifted) {
    const key = cellKey(cell);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cell);
    }
  }
  return out;
}

export function rotateFootprint(footprint: Footprint, rotation: Rotation): Footprint {
  const turns = ((rotation % 4) + 4) % 4;
  let cells = footprint.map(([c, r]): Cell => [c, r]);
  for (let i = 0; i < turns; i++) {
    cells = cells.map(([c, r]): Cell => [-r, c]);
  }
  return normalizeFootprint(cells);
}

export function occupiedCells(
  footprint: Footprint,
  origin: Cell,
  rotation: Rotation,
): Cell[] {
  const rotated = rotateFootprint(footprint, rotation);
  return rotated.map(([c, r]): Cell => [c + origin[0], r + origin[1]]);
}

/**
 * A spatial grid inventory that holds shaped multi-cell items, Resident-Evil/Tarkov style.
 *
 * @capability tetris-inventory a spatial grid inventory holding shaped multi-cell items
 */
export function createShapedGrid<T>(width: number, height: number): ShapedGrid<T> {
  if (width <= 0 || height <= 0) throw new Error("shaped grid needs positive dimensions");
  return { width, height, placements: [] };
}

function inBounds<T>(grid: ShapedGrid<T>, cells: readonly Cell[]): boolean {
  return cells.every(([c, r]) => c >= 0 && r >= 0 && c < grid.width && r < grid.height);
}

function occupancyMap<T>(grid: ShapedGrid<T>, ignoreId?: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const placement of grid.placements) {
    if (placement.id === ignoreId) continue;
    for (const cell of occupiedCells(placement.footprint, placement.origin, placement.rotation)) {
      map.set(cellKey(cell), placement.id);
    }
  }
  return map;
}

export function canPlace<T>(
  grid: ShapedGrid<T>,
  footprint: Footprint,
  origin: Cell,
  rotation: Rotation,
  ignoreId?: string,
): ShapedRejection | null {
  const cells = occupiedCells(footprint, origin, rotation);
  if (!inBounds(grid, cells)) return "out-of-bounds";
  const occupied = occupancyMap(grid, ignoreId);
  for (const cell of cells) {
    if (occupied.has(cellKey(cell))) return "overlap";
  }
  return null;
}

export function placeShaped<T>(
  grid: ShapedGrid<T>,
  item: ShapedItem<T>,
  origin: Cell,
  rotation: Rotation = 0,
): ShapedResult<T> {
  if (grid.placements.some((p) => p.id === item.id)) {
    return { status: "rejected", reason: "duplicate-id", detail: item.id };
  }
  const rejection = canPlace(grid, item.footprint, origin, rotation);
  if (rejection !== null) return { status: "rejected", reason: rejection };
  const placement: Placement<T> = {
    id: item.id,
    value: item.value,
    footprint: item.footprint,
    origin,
    rotation,
  };
  return { status: "ok", grid: { ...grid, placements: [...grid.placements, placement] } };
}

export function removeShaped<T>(grid: ShapedGrid<T>, id: string): ShapedResult<T> {
  if (!grid.placements.some((p) => p.id === id)) {
    return { status: "rejected", reason: "unknown-id", detail: id };
  }
  return { status: "ok", grid: { ...grid, placements: grid.placements.filter((p) => p.id !== id) } };
}

export function moveShaped<T>(
  grid: ShapedGrid<T>,
  id: string,
  origin: Cell,
  rotation?: Rotation,
): ShapedResult<T> {
  const existing = grid.placements.find((p) => p.id === id);
  if (existing === undefined) return { status: "rejected", reason: "unknown-id", detail: id };
  const nextRotation = rotation ?? existing.rotation;
  const rejection = canPlace(grid, existing.footprint, origin, nextRotation, id);
  if (rejection !== null) return { status: "rejected", reason: rejection };
  return {
    status: "ok",
    grid: {
      ...grid,
      placements: grid.placements.map((p) =>
        p.id === id ? { ...p, origin, rotation: nextRotation } : p,
      ),
    },
  };
}

export function cellOccupant<T>(grid: ShapedGrid<T>, cell: Cell): string | null {
  return occupancyMap(grid).get(cellKey(cell)) ?? null;
}

const ORTHOGONAL: readonly Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: readonly Cell[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export interface GridAdjacencyQuery {
  cellsOf(id: string): readonly Cell[];
  neighborsOf(id: string): readonly string[];
  touching(idA: string, idB: string): boolean;
  adjacentCells(cells: readonly Cell[]): readonly Cell[];
}

export function gridAdjacencyQuery<T>(
  grid: ShapedGrid<T>,
  options: { diagonal?: boolean } = {},
): GridAdjacencyQuery {
  const directions = options.diagonal ? [...ORTHOGONAL, ...DIAGONAL] : ORTHOGONAL;
  const cellsById = new Map<string, Cell[]>();
  const owner = new Map<string, string>();
  for (const placement of grid.placements) {
    const cells = occupiedCells(placement.footprint, placement.origin, placement.rotation);
    cellsById.set(placement.id, cells);
    for (const cell of cells) owner.set(cellKey(cell), placement.id);
  }
  const cellsOf = (id: string): readonly Cell[] => cellsById.get(id) ?? [];
  const neighborsOf = (id: string): readonly string[] => {
    const found = new Set<string>();
    for (const cell of cellsOf(id)) {
      for (const [dc, dr] of directions) {
        const key = cellKey([cell[0] + dc, cell[1] + dr]);
        const other = owner.get(key);
        if (other !== undefined && other !== id) found.add(other);
      }
    }
    return [...found];
  };
  return {
    cellsOf,
    neighborsOf,
    touching: (idA, idB) => neighborsOf(idA).includes(idB),
    adjacentCells(cells) {
      const own = new Set(cells.map(cellKey));
      const found = new Set<string>();
      const out: Cell[] = [];
      for (const cell of cells) {
        for (const [dc, dr] of directions) {
          const target: Cell = [cell[0] + dc, cell[1] + dr];
          const key = cellKey(target);
          if (own.has(key) || found.has(key)) continue;
          if (target[0] < 0 || target[1] < 0 || target[0] >= grid.width || target[1] >= grid.height) {
            continue;
          }
          found.add(key);
          out.push(target);
        }
      }
      return out;
    },
  };
}

export function cellFromPoint(
  point: { x: number; y: number },
  cellSize: number,
  gridOrigin: { x: number; y: number } = { x: 0, y: 0 },
): Cell {
  return [
    Math.floor((point.x - gridOrigin.x) / cellSize),
    Math.floor((point.y - gridOrigin.y) / cellSize),
  ];
}
