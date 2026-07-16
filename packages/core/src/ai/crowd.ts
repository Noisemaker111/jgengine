import { seededRng } from "../random/rng";
import type { NavGrid, NavPoint } from "../nav/navGrid";

const SQRT2 = Math.SQRT2;

/**
 * Deterministic 2D offset uniformly within a disc of `radius`, stable per `id` — so a crowd converging
 * on one target (a flank point, a rally banner, a boss) fans out to distinct spots instead of all
 * stacking on the same coordinate. Same `id` always yields the same offset, no per-entity state to store.
  * @internal
  */
export function spreadOffset(id: string, radius: number): readonly [number, number] {
  const rng = seededRng(id);
  const angle = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * radius;
  return [Math.cos(angle) * r, Math.sin(angle) * r];
}

export interface FlowFieldOptions {
  clearance?: number;
  congestion?: (col: number, row: number) => number;
}

export interface FlowField {
  readonly cols: number;
  readonly rows: number;
  cost(col: number, row: number): number;
  reachable(point: NavPoint): boolean;
  direction(point: NavPoint): NavPoint;
  next(point: NavPoint): NavPoint | null;
}

interface FlowHeapNode {
  key: number;
  cost: number;
}

function heapPush(heap: FlowHeapNode[], node: FlowHeapNode): void {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent]!.cost <= heap[i]!.cost) break;
    [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
    i = parent;
  }
}

function heapPop(heap: FlowHeapNode[]): FlowHeapNode | undefined {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0 && last !== undefined) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < heap.length && heap[left]!.cost < heap[smallest]!.cost) smallest = left;
      if (right < heap.length && heap[right]!.cost < heap[smallest]!.cost) smallest = right;
      if (smallest === i) break;
      [heap[smallest], heap[i]] = [heap[i]!, heap[smallest]!];
      i = smallest;
    }
  }
  return top;
}

function passableWithClearance(grid: NavGrid, clearance: number): (col: number, row: number) => boolean {
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

/** @internal */
export function computeFlowField(
  grid: NavGrid,
  goals: readonly NavPoint[],
  options: FlowFieldOptions = {},
): FlowField {
  const { cols, rows } = grid;
  const passable = passableWithClearance(grid, options.clearance ?? 0);
  const congestion = options.congestion;
  const cost = new Float64Array(cols * rows).fill(Number.POSITIVE_INFINITY);
  const index = (col: number, row: number) => row * cols + col;

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

  const heap: FlowHeapNode[] = [];
  for (const goal of goals) {
    const cell = grid.cellAt(goal);
    if (!passable(cell.col, cell.row)) continue;
    const key = index(cell.col, cell.row);
    if (cost[key] === 0) continue;
    cost[key] = 0;
    heapPush(heap, { key, cost: 0 });
  }

  while (heap.length > 0) {
    const current = heapPop(heap)!;
    const col = current.key % cols;
    const row = (current.key - col) / cols;
    if (current.cost > cost[current.key]!) continue;
    for (const [dx, dy, step] of neighbours) {
      const nc = col + dx;
      const nr = row + dy;
      if (!passable(nc, nr)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(col + dx, row) || !passable(col, row + dy))) continue;
      const extra = congestion === undefined ? 0 : Math.max(0, congestion(nc, nr));
      const tentative = current.cost + step + extra;
      const nKey = index(nc, nr);
      if (tentative < cost[nKey]!) {
        cost[nKey] = tentative;
        heapPush(heap, { key: nKey, cost: tentative });
      }
    }
  }

  function bestNeighbour(col: number, row: number): { col: number; row: number; cost: number } | null {
    let best: { col: number; row: number; cost: number } | null = null;
    for (const [dx, dy] of neighbours) {
      const nc = col + dx;
      const nr = row + dy;
      if (!grid.inBounds(nc, nr)) continue;
      const c = cost[index(nc, nr)]!;
      if (best === null || c < best.cost) best = { col: nc, row: nr, cost: c };
    }
    return best;
  }

  const field: FlowField = {
    cols,
    rows,
    cost: (col, row) => (grid.inBounds(col, row) ? cost[index(col, row)]! : Number.POSITIVE_INFINITY),
    reachable(point) {
      const cell = grid.cellAt(point);
      return Number.isFinite(cost[index(cell.col, cell.row)]!);
    },
    direction(point) {
      const cell = grid.cellAt(point);
      const here = cost[index(cell.col, cell.row)]!;
      if (!Number.isFinite(here) || here === 0) return [0, 0];
      const best = bestNeighbour(cell.col, cell.row);
      if (best === null || !(best.cost < here)) return [0, 0];
      const target = grid.center(best.col, best.row);
      const dx = target[0] - point[0];
      const dz = target[1] - point[1];
      const length = Math.hypot(dx, dz);
      return length < 1e-9 ? [0, 0] : [dx / length, dz / length];
    },
    next(point) {
      const cell = grid.cellAt(point);
      const here = cost[index(cell.col, cell.row)]!;
      if (!Number.isFinite(here) || here === 0) return null;
      const best = bestNeighbour(cell.col, cell.row);
      if (best === null || !(best.cost < here)) return null;
      return grid.center(best.col, best.row);
    },
  };
  return field;
}

export interface CrowdField {
  enter(point: NavPoint): void;
  leave(point: NavPoint): void;
  count(point: NavPoint): number;
  cellCount(col: number, row: number): number;
  penalty(weight?: number): (col: number, row: number) => number;
  reset(): void;
}

/** @internal */
export function createCrowdField(grid: NavGrid): CrowdField {
  const { cols, rows } = grid;
  const occupancy = new Int32Array(cols * rows);
  const index = (col: number, row: number) => row * cols + col;

  return {
    enter(point) {
      const cell = grid.cellAt(point);
      occupancy[index(cell.col, cell.row)] += 1;
    },
    leave(point) {
      const cell = grid.cellAt(point);
      const key = index(cell.col, cell.row);
      if (occupancy[key]! > 0) occupancy[key] -= 1;
    },
    count(point) {
      const cell = grid.cellAt(point);
      return occupancy[index(cell.col, cell.row)]!;
    },
    cellCount(col, row) {
      return grid.inBounds(col, row) ? occupancy[index(col, row)]! : 0;
    },
    penalty(weight = 1) {
      return (col, row) => (grid.inBounds(col, row) ? occupancy[index(col, row)]! * weight : 0);
    },
    reset() {
      occupancy.fill(0);
    },
  };
}

export interface Poi {
  id: string;
  point: NavPoint;
  appeal?: number;
  capacity?: number;
}

export interface SelectPoiOptions {
  roll: number;
  occupancy?: (id: string) => number;
  distanceBias?: number;
  distance?: (from: NavPoint, poi: Poi) => number;
}

function euclidean(from: NavPoint, poi: Poi): number {
  return Math.hypot(poi.point[0] - from[0], poi.point[1] - from[1]);
}

/** @internal */
export function selectPoi(pois: readonly Poi[], from: NavPoint, options: SelectPoiOptions): Poi | null {
  const distanceBias = options.distanceBias ?? 1;
  const distanceOf = options.distance ?? euclidean;
  const weights: number[] = [];
  const eligible: Poi[] = [];
  let total = 0;
  for (const poi of pois) {
    if (poi.capacity !== undefined && (options.occupancy?.(poi.id) ?? 0) >= poi.capacity) continue;
    const distance = distanceOf(from, poi);
    if (!Number.isFinite(distance)) continue;
    const weight = Math.max(1e-6, (poi.appeal ?? 1) / (1 + distance) ** distanceBias);
    eligible.push(poi);
    weights.push(weight);
    total += weight;
  }
  if (eligible.length === 0 || total <= 0) return null;
  const roll = options.roll < 0 ? 0 : options.roll > 1 ? 1 : options.roll;
  let cursor = roll * total;
  for (let i = 0; i < eligible.length; i += 1) {
    cursor -= weights[i]!;
    if (cursor <= 0) return eligible[i]!;
  }
  return eligible[eligible.length - 1]!;
}

/** A many-agent visitor's current step of the seek→travel→arrive→dwell→depart loop. */
export type VisitorPhase = "seeking" | "traveling" | "dwelling" | "departing" | "done";

/** One tick's result from a {@link VisitorLoop}: current phase, where to steer, and which POI it concerns. */
export interface VisitorStep {
  phase: VisitorPhase;
  /** Where to steer this tick (feed `scene.entity.moveToward`/`moveTowardCommit`), or `null` once `done` or stuck `seeking` with no eligible POI. */
  target: NavPoint | null;
  poiId: string | null;
}

/** Config for {@link createVisitorLoop}: the POI catalog, dwell duration, and exit point every agent shares. */
export interface VisitorLoopOptions {
  pois: readonly Poi[];
  /** How long (ms, sim time) a visitor lingers once it arrives at a POI. */
  dwellMs: (poi: Poi) => number;
  /** Where a visitor heads once its dwell ends — a fixed exit/despawn point, or one resolved per agent (multiple gates). */
  exitPoint: NavPoint | ((agentId: string) => NavPoint);
  /** Distance under which "traveling"/"departing" counts as arrived. Default 1. */
  arriveRadius?: number;
  occupancy?: (poiId: string) => number;
  distanceBias?: number;
  distance?: (from: NavPoint, poi: Poi) => number;
  /** Fires once, on the traveling→dwelling transition (e.g. `crowdField.enter(poi.point)`). */
  onArrive?: (agentId: string, poiId: string) => void;
  /** Fires once, on the dwelling→departing transition (e.g. `crowdField.leave(poi.point)`). */
  onDepart?: (agentId: string, poiId: string) => void;
}

/** Handle returned by {@link createVisitorLoop}: per-agent seek/travel/dwell/depart state machine. */
export interface VisitorLoop {
  /** Registers `agentId` in the `"seeking"` phase; `tick` also auto-spawns on first call. */
  spawn(agentId: string): VisitorStep;
  /** Advances one agent by `dtMs` from its current `position`; `roll()` feeds `selectPoi`'s weighted pick. */
  tick(agentId: string, position: NavPoint, dtMs: number, roll: () => number): VisitorStep;
  get(agentId: string): VisitorStep | null;
  remove(agentId: string): void;
  clear(): void;
}

interface VisitorAgentState {
  phase: VisitorPhase;
  poiId: string | null;
  dwellRemaining: number;
}

function toStep(state: VisitorAgentState, poiOf: (id: string) => Poi | undefined, exitOf: (agentId: string) => NavPoint, agentId: string): VisitorStep {
  if (state.phase === "seeking" || state.phase === "done") {
    return { phase: state.phase, target: null, poiId: null };
  }
  if (state.phase === "departing") {
    return { phase: "departing", target: exitOf(agentId), poiId: state.poiId };
  }
  const poi = state.poiId === null ? undefined : poiOf(state.poiId);
  return { phase: state.phase, target: poi?.point ?? null, poiId: state.poiId };
}

/**
 * A many-agent seek→travel→arrive→dwell→depart loop over weighted points of interest (park visitors,
 * shoppers, tavern patrons) — `ai/crowd`'s `selectPoi` covers only the weighted-pick step; this owns
 * the per-agent phase machine around it so the caller only supplies positions and drives movement.
 *
 * @capability visitor-loop many-agent seek/travel/dwell/depart state machine over weighted POIs
  * @internal
  */
export function createVisitorLoop(options: VisitorLoopOptions): VisitorLoop {
  const { pois, dwellMs, exitPoint, occupancy, distanceBias, distance } = options;
  const arriveRadius = options.arriveRadius ?? 1;
  const agents = new Map<string, VisitorAgentState>();
  const poiById = new Map(pois.map((poi) => [poi.id, poi] as const));

  function poiOf(id: string): Poi | undefined {
    return poiById.get(id);
  }

  function exitOf(agentId: string): NavPoint {
    return typeof exitPoint === "function" ? exitPoint(agentId) : exitPoint;
  }

  function ensure(agentId: string): VisitorAgentState {
    let state = agents.get(agentId);
    if (state === undefined) {
      state = { phase: "seeking", poiId: null, dwellRemaining: 0 };
      agents.set(agentId, state);
    }
    return state;
  }

  return {
    spawn(agentId) {
      const state = ensure(agentId);
      return toStep(state, poiOf, exitOf, agentId);
    },
    tick(agentId, position, dtMs, roll) {
      const state = ensure(agentId);
      if (state.phase === "seeking") {
        const poi = selectPoi(pois, position, {
          roll: roll(),
          ...(occupancy === undefined ? {} : { occupancy }),
          ...(distanceBias === undefined ? {} : { distanceBias }),
          ...(distance === undefined ? {} : { distance }),
        });
        if (poi !== null) {
          state.poiId = poi.id;
          state.phase = "traveling";
        }
      } else if (state.phase === "traveling") {
        const poi = state.poiId === null ? undefined : poiOf(state.poiId);
        if (poi === undefined) {
          state.phase = "departing";
          state.poiId = null;
        } else if ((distance ?? euclidean)(position, poi) <= arriveRadius) {
          state.phase = "dwelling";
          state.dwellRemaining = dwellMs(poi);
          options.onArrive?.(agentId, poi.id);
        }
      } else if (state.phase === "dwelling") {
        state.dwellRemaining -= dtMs;
        if (state.dwellRemaining <= 0) {
          const poiId = state.poiId;
          state.phase = "departing";
          if (poiId !== null) options.onDepart?.(agentId, poiId);
        }
      } else if (state.phase === "departing") {
        const exit = exitOf(agentId);
        if (Math.hypot(exit[0] - position[0], exit[1] - position[1]) <= arriveRadius) {
          state.phase = "done";
          state.poiId = null;
        }
      }
      return toStep(state, poiOf, exitOf, agentId);
    },
    get(agentId) {
      const state = agents.get(agentId);
      return state === undefined ? null : toStep(state, poiOf, exitOf, agentId);
    },
    remove(agentId) {
      agents.delete(agentId);
    },
    clear() {
      agents.clear();
    },
  };
}
