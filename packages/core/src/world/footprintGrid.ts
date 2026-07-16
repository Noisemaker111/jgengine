import type { Footprint, Vec2 } from "./geometry";
import type { PlacementObstacle } from "./placement";

/** One integer cell address on a {@link FootprintGrid}. */
export interface GridCell {
  col: number;
  row: number;
}

/** Config for {@link createFootprintGrid}. */
export interface FootprintGridOptions {
  /** World units per cell. Default 1. */
  cellSize?: number;
}

/** A live claim on a {@link FootprintGrid}: which cells `id` (a `kind` tag for adjacency checks) holds. */
export interface FootprintReservation {
  id: string;
  kind: string;
  cells: readonly GridCell[];
}

/** Handle returned by {@link createFootprintGrid}. */
export interface FootprintGrid {
  readonly cellSize: number;
  /** The cells a `footprint` centered on `origin` (world units) covers, honoring `quarterTurns` — feed straight into `reserve`/`isFree`. */
  cellsFor(origin: Vec2, footprint: Footprint, quarterTurns?: number): GridCell[];
  isFree(cells: readonly GridCell[]): boolean;
  /** Claims every cell for `id`/`kind`; fails (no partial reservation) if `id` already holds a reservation or any cell is occupied. */
  reserve(id: string, kind: string, cells: readonly GridCell[]): boolean;
  release(id: string): boolean;
  occupantAt(cell: GridCell): string | null;
  kindAt(cell: GridCell): string | null;
  reservationOf(id: string): FootprintReservation | null;
  list(): readonly FootprintReservation[];
  clear(): void;
}

function cellKey(cell: GridCell): string {
  return `${cell.col}:${cell.row}`;
}

/**
 * Multi-cell footprint occupancy/reservation on a shared build grid — `world/placementController`
 * only owns the ghost preview; this is the persistent claim a committed placement holds so the next
 * hover's `isFree` check (or another player's, in a shared world) sees it. Bridge into
 * `world/placement`'s `PlacementRules.obstacles` with {@link footprintObstacles} instead of
 * hand-rolling an occupancy map per game.
 *
 * @capability footprint-grid multi-cell footprint occupancy/reservation on a shared build grid
 */
export function createFootprintGrid(options: FootprintGridOptions = {}): FootprintGrid {
  const cellSize = options.cellSize ?? 1;
  const occupied = new Map<string, string>();
  const reservations = new Map<string, FootprintReservation>();

  return {
    cellSize,
    cellsFor(origin, footprint, quarterTurns = 0) {
      const turned = ((quarterTurns % 2) + 2) % 2 === 1;
      const cols = Math.max(1, Math.round((turned ? footprint.d : footprint.w) / cellSize));
      const rows = Math.max(1, Math.round((turned ? footprint.w : footprint.d) / cellSize));
      const originCol = Math.round(origin[0] / cellSize - cols / 2);
      const originRow = Math.round(origin[1] / cellSize - rows / 2);
      const cells: GridCell[] = [];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) cells.push({ col: originCol + col, row: originRow + row });
      }
      return cells;
    },
    isFree(cells) {
      return cells.every((cell) => !occupied.has(cellKey(cell)));
    },
    reserve(id, kind, cells) {
      if (reservations.has(id)) return false;
      if (!cells.every((cell) => !occupied.has(cellKey(cell)))) return false;
      for (const cell of cells) occupied.set(cellKey(cell), id);
      reservations.set(id, { id, kind, cells: cells.slice() });
      return true;
    },
    release(id) {
      const reservation = reservations.get(id);
      if (reservation === undefined) return false;
      for (const cell of reservation.cells) occupied.delete(cellKey(cell));
      reservations.delete(id);
      return true;
    },
    occupantAt(cell) {
      return occupied.get(cellKey(cell)) ?? null;
    },
    kindAt(cell) {
      const id = occupied.get(cellKey(cell));
      if (id === undefined) return null;
      return reservations.get(id)?.kind ?? null;
    },
    reservationOf(id) {
      return reservations.get(id) ?? null;
    },
    list() {
      return Array.from(reservations.values());
    },
    clear() {
      occupied.clear();
      reservations.clear();
    },
  };
}

const CARDINAL_OFFSETS: readonly GridCell[] = [
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
];

/** One occupied neighbor cell reported by {@link boundaryNeighbors}. */
export interface AdjacentCell {
  cell: GridCell;
  kind: string;
}

/** Every occupied cell orthogonally touching `cells` but outside them — the connective-piece neighbor set. */
export function boundaryNeighbors(grid: FootprintGrid, cells: readonly GridCell[]): AdjacentCell[] {
  const own = new Set(cells.map(cellKey));
  const seen = new Set<string>();
  const out: AdjacentCell[] = [];
  for (const cell of cells) {
    for (const offset of CARDINAL_OFFSETS) {
      const neighbor: GridCell = { col: cell.col + offset.col, row: cell.row + offset.row };
      const key = cellKey(neighbor);
      if (own.has(key) || seen.has(key)) continue;
      seen.add(key);
      const kind = grid.kindAt(neighbor);
      if (kind !== null) out.push({ cell: neighbor, kind });
    }
  }
  return out;
}

/**
 * Connective-piece adjacency validity: every occupied neighbor of `cells` must satisfy `accepts`
 * (no incompatible piece touching), and when `requireConnection` is true at least one neighbor must
 * (a road/pipe/belt segment placed with nothing to connect to is invalid). An empty-bordered footprint
 * (no occupied neighbors at all) passes unless `requireConnection` demands one.
 */
export function hasValidAdjacency(
  grid: FootprintGrid,
  cells: readonly GridCell[],
  accepts: (neighborKind: string) => boolean,
  requireConnection = false,
): boolean {
  const neighbors = boundaryNeighbors(grid, cells);
  if (requireConnection && neighbors.length === 0) return false;
  if (!neighbors.every((neighbor) => accepts(neighbor.kind))) return false;
  return !requireConnection || neighbors.some((neighbor) => accepts(neighbor.kind));
}

/**
 * True when at least one cell orthogonally touching `cells` (but outside them) is occupied by a kind
 * `accepts` admits — the "must touch existing track/road/pipe" placement gate. Looser than
 * {@link hasValidAdjacency}: it only asks whether *some* neighbor connects, and never rejects an
 * incompatible neighbor. `accepts` omitted matches any occupied neighbor.
 *
 * @capability footprint-adjacency 4-neighbor connectivity check for connective-piece placement
 */
export function connectedTo(
  grid: FootprintGrid,
  cells: readonly GridCell[],
  accepts?: (neighborKind: string) => boolean,
): boolean {
  return boundaryNeighbors(grid, cells).some((neighbor) => accepts === undefined || accepts(neighbor.kind));
}

/** Bridges live reservations into `world/placement`'s `PlacementRules.obstacles` so `validatePlacement`/`createPlacementController` see the grid's committed footprints unchanged. */
export function footprintObstacles(grid: FootprintGrid): PlacementObstacle[] {
  return grid.list().map((reservation) => {
    let minCol = Infinity;
    let minRow = Infinity;
    let maxCol = -Infinity;
    let maxRow = -Infinity;
    for (const cell of reservation.cells) {
      if (cell.col < minCol) minCol = cell.col;
      if (cell.col > maxCol) maxCol = cell.col;
      if (cell.row < minRow) minRow = cell.row;
      if (cell.row > maxRow) maxRow = cell.row;
    }
    return {
      id: reservation.id,
      aabb: {
        minX: minCol * grid.cellSize,
        maxX: (maxCol + 1) * grid.cellSize,
        minZ: minRow * grid.cellSize,
        maxZ: (maxRow + 1) * grid.cellSize,
      },
    };
  });
}
