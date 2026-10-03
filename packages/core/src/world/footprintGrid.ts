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

/** Plain JSON state of a {@link FootprintGrid}: live reservations in claim order. */
export interface FootprintGridState {
  reservations: FootprintReservation[];
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
  snapshot(): FootprintGridState;
  /** Replaces every reservation with `next`'s and rebuilds cell occupancy from them. */
  restore(next: FootprintGridState): void;
}

function cellKey(cell: GridCell): string {
  return `${cell.col}:${cell.row}`;
}

function copyReservation(reservation: FootprintReservation): FootprintReservation {
  return { id: reservation.id, kind: reservation.kind, cells: reservation.cells.map((cell) => ({ col: cell.col, row: cell.row })) };
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
    snapshot() {
      return { reservations: Array.from(reservations.values(), copyReservation) };
    },
    restore(next) {
      occupied.clear();
      reservations.clear();
      for (const reservation of next.reservations) {
        const copy = copyReservation(reservation);
        reservations.set(copy.id, copy);
        for (const cell of copy.cells) occupied.set(cellKey(cell), copy.id);
      }
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

/** Caller-owned logical footprint. Cells must be unique, safe integer addresses and cardinally connected. */
export interface RegionFootprint {
  readonly id: string;
  readonly kind: string;
  readonly tier: number;
  readonly cells: readonly GridCell[];
  /** Nonnegative finite contribution; independent of occupied area. */
  readonly capacity: number;
}

/** Original footprint identity and capacity retained when regions pool. */
export interface RegionContribution {
  readonly id: string;
  readonly cells: readonly GridCell[];
  readonly capacity: number;
}

/** Plain JSON pooled region. Contributions partition its cells and sum to its capacity. */
export interface MergedRegion extends RegionFootprint {
  readonly contributions: readonly RegionContribution[];
}

/** Optional caller work limits, checked before cell traversal. Omitted limits follow input size. */
export interface RegionWorkBudget {
  readonly maxCells?: number;
  readonly maxContributions?: number;
}

/** Identities for split sides containing multiple contributions; singletons retain their original id. */
export interface RegionSplitIds {
  readonly left?: string;
  readonly right?: string;
}

/** A standalone footprint or a pooled region carrying its original contributions. */
export type FootprintRegion = RegionFootprint | MergedRegion;
type CheckedRegion = {
  cells: Map<string, GridCell>;
  contributions: readonly RegionContribution[];
  ids: Set<string>;
};

function validId(id: string): boolean { return typeof id === "string" && id.length > 0; }
function validCapacity(capacity: number): boolean { return Number.isFinite(capacity) && capacity >= 0; }

function contributionCount(region: FootprintRegion): number | null {
  if (region === null || typeof region !== "object") return null;
  if (!Array.isArray(region.cells)) return null;
  if (!("contributions" in region)) return 1;
  return Array.isArray(region.contributions) ? region.contributions.length : null;
}

function withinRegionBudget(regions: readonly FootprintRegion[], budget: RegionWorkBudget): boolean {
  let cells = 0;
  let contributions = 0;
  for (const region of regions) {
    const count = contributionCount(region);
    if (count === null) return false;
    cells += region.cells.length;
    contributions += count;
  }
  for (const [limit, count] of [[budget.maxCells, cells], [budget.maxContributions, contributions]] as const) {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0 || count > limit)) return false;
  }
  return true;
}

function regionCells(cells: readonly GridCell[]): Map<string, GridCell> | null {
  if (cells.length === 0) return null;
  const out = new Map<string, GridCell>();
  for (const cell of cells) {
    if (cell === null || typeof cell !== "object") return null;
    if (!Number.isSafeInteger(cell.col) || !Number.isSafeInteger(cell.row)) return null;
    const key = cellKey(cell);
    if (out.has(key)) return null;
    out.set(key, cell);
  }
  return out;
}

function connectedRegion(cells: Map<string, GridCell>): boolean {
  const first = cells.values().next().value;
  if (first === undefined) return false;
  const queue = [first];
  const visited = new Set([cellKey(first)]);
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index]!;
    for (const offset of CARDINAL_OFFSETS) {
      const key = cellKey({ col: cell.col + offset.col, row: cell.row + offset.row });
      const next = cells.get(key);
      if (next !== undefined && !visited.has(key)) { visited.add(key); queue.push(next); }
    }
  }
  return queue.length === cells.size;
}

function checkedRegion(region: FootprintRegion): CheckedRegion | null {
  if (!validId(region.id) || !validId(region.kind) || !Number.isFinite(region.tier) || !validCapacity(region.capacity)) return null;
  const cells = regionCells(region.cells);
  if (cells === null || !connectedRegion(cells)) return null;
  const contributions = "contributions" in region ? region.contributions : [region];
  if (contributions.length === 0) return null;
  const ids = new Set<string>();
  const covered = new Set<string>();
  let capacity = 0;
  for (const contribution of contributions) {
    if (contribution === null || typeof contribution !== "object") return null;
    if (!validId(contribution.id) || ids.has(contribution.id) || !validCapacity(contribution.capacity) || !Array.isArray(contribution.cells)) return null;
    if (contribution.cells.length > cells.size - covered.size) return null;
    ids.add(contribution.id);
    const partCells = regionCells(contribution.cells);
    if (partCells === null || !connectedRegion(partCells)) return null;
    for (const key of partCells.keys()) {
      if (!cells.has(key) || covered.has(key)) return null;
      covered.add(key);
    }
    capacity += contribution.capacity;
  }
  if (!Number.isFinite(capacity) || capacity !== region.capacity || covered.size !== cells.size) return null;
  return { cells, contributions, ids };
}

function mergeableRegions(a: FootprintRegion, b: FootprintRegion, budget: RegionWorkBudget): [CheckedRegion, CheckedRegion] | null {
  if (!withinRegionBudget([a, b], budget) || a.id === b.id || a.kind !== b.kind || a.tier !== b.tier) return null;
  const left = checkedRegion(a);
  const right = checkedRegion(b);
  if (left === null || right === null) return null;
  if (right.ids.has(a.id) || left.ids.has(b.id)) return null;
  for (const id of left.ids) if (right.ids.has(id)) return null;
  let adjacent = false;
  for (const [key, cell] of left.cells) {
    if (right.cells.has(key)) return null;
    for (const offset of CARDINAL_OFFSETS) {
      if (right.cells.has(cellKey({ col: cell.col + offset.col, row: cell.row + offset.row }))) adjacent = true;
    }
  }
  let capacity = 0;
  for (const contribution of left.contributions) capacity += contribution.capacity;
  for (const contribution of right.contributions) capacity += contribution.capacity;
  return adjacent && Number.isFinite(capacity) ? [left, right] : null;
}

function copyRegionCells(cells: readonly GridCell[]): GridCell[] {
  return cells.map(cell => ({ col: cell.col, row: cell.row }));
}

function pooledRegion(id: string, kind: string, tier: number, parts: readonly RegionContribution[]): MergedRegion {
  const contributions = parts.map(part => ({ id: part.id, capacity: part.capacity, cells: copyRegionCells(part.cells) }));
  return { id, kind, tier, capacity: contributions.reduce((sum, part) => sum + part.capacity, 0),
    cells: contributions.flatMap(part => copyRegionCells(part.cells)), contributions };
}

/** Matching kind/tier, disjoint valid source identities/cells, and cardinal contact. Linear in input size.
 * @capability mergeable-footprint-regions check compatible adjacent regions within caller work budgets
 */
export function canMerge(a: FootprintRegion, b: FootprintRegion, budget: RegionWorkBudget = {}): boolean {
  return mergeableRegions(a, b, budget) !== null;
}

/**
 * Pool compatible footprints under caller-owned `id`, retaining original capacities and identities.
 * Returns null for invalid data, kind/tier mismatch, overlap, no cardinal contact or exhausted budget.
 * Does not mutate inputs or grid reservations; costs, merge width and upgrade policy remain caller-owned.
 * Capacity is the ordered JavaScript-number sum of original contributions, independent of cell area.
 *
 * @capability merge-footprint-regions pool adjacent compatible footprints with serializable capacity provenance
 */
export function mergeFootprints(a: FootprintRegion, b: FootprintRegion, id: string, budget: RegionWorkBudget = {}): MergedRegion | null {
  if (!validId(id)) return null;
  const checked = mergeableRegions(a, b, budget);
  if (checked === null) return null;
  return pooledRegion(id, a.kind, a.tier, [...checked[0].contributions, ...checked[1].contributions]);
}

/**
 * Partition whole original contributions by `leftIds`; both sides must remain cardinally connected.
 * Singletons restore their original id and capacity; larger sides require explicit output identities.
 * Returns null for invalid provenance/budget, unknown or duplicate ids, empty/disconnected sides, or
 * conflicting output identities (including identities from the opposite side's contributions).
 * An output may reuse its own side's source identity. Cell cuts/capacity repricing require caller policy.
 * Both sides inherit the current region kind/tier. Inputs and grid reservations remain unchanged.
 *
 * @capability split-footprint-regions split pooled regions along retained contributions without area-based capacity loss
 */
export function splitRegion(
  region: MergedRegion,
  leftIds: readonly string[],
  ids: RegionSplitIds = {},
  budget: RegionWorkBudget = {},
): [FootprintRegion, FootprintRegion] | null {
  if (!withinRegionBudget([region], budget)) return null;
  const checked = checkedRegion(region);
  if (checked === null || leftIds.length === 0 || leftIds.length >= checked.contributions.length) return null;
  const selected = new Set<string>();
  for (const id of leftIds) {
    if (!checked.ids.has(id) || selected.has(id)) return null;
    selected.add(id);
  }
  const left: RegionContribution[] = [];
  const right: RegionContribution[] = [];
  for (const part of checked.contributions) (selected.has(part.id) ? left : right).push(part);
  function side(parts: RegionContribution[], id: string | undefined): FootprintRegion | null {
    if (parts.length === 1) {
      const part = parts[0]!;
      if (id !== undefined && id !== part.id) return null;
      return { id: part.id, kind: region.kind, tier: region.tier, capacity: part.capacity, cells: copyRegionCells(part.cells) };
    }
    if (id === undefined || !validId(id)) return null;
    const pooled = pooledRegion(id, region.kind, region.tier, parts);
    const cells = regionCells(pooled.cells);
    return cells !== null && connectedRegion(cells) ? pooled : null;
  }
  const a = side(left, ids.left);
  const b = side(right, ids.right);
  if (a === null || b === null || a.id === b.id) return null;
  if (right.some(part => part.id === a.id) || left.some(part => part.id === b.id)) return null;
  return [a, b];
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
