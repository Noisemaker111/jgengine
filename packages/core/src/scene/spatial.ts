import type { EntityPosition } from "./entityStore";

export type Aim =
  | { origin: EntityPosition; direction: EntityPosition }
  | { yaw: number; pitch: number; spread?: number };

export interface QueryArcOptions {
  from: string;
  aim: Aim;
  radius: number;
  halfAngleDeg?: number;
}

export interface MoveTowardOptions {
  speed: number;
  stopDistance?: number;
  dt: number;
}

export interface SpatialGridOptions {
  /** Cell edge over the x/z plane; tune to ≈ the typical query radius so a query touches a handful of cells. */
  cellSize: number;
}

export interface SpatialApiOptions {
  resolvePosition: (instanceId: string) => EntityPosition | undefined;
  candidates: () => string[];
  /**
   * When omitted, `hasLineOfSight` always returns true for known entities (open-field bypass).
   * Wire a wall/collision test here for combat LoS; `true` means the segment is blocked.
   */
  occluder?: (from: EntityPosition, to: EntityPosition) => boolean;
  /**
   * Opt-in broadphase acceleration for `inRadius`/`queryArc` over large candidate sets. When set,
   * a uniform x/z cell index is built lazily from `candidates()` + `resolvePosition()` on first use
   * and reused across calls until `invalidate()` is called — so many queries against one tick's
   * frozen positions pay for one rebuild, not one linear scan each. Results are exactly the linear
   * scan's results (same filtering; see `SpatialApi.invalidate` for the staleness contract).
   */
  grid?: SpatialGridOptions;
}

export interface SpatialApi {
  distance(aInstanceId: string, bInstanceId: string): number | null;
  inRadius(center: EntityPosition | string, radius: number, filter?: (instanceId: string) => boolean): string[];
  hasLineOfSight(fromInstanceId: string, toInstanceId: string): boolean;
  queryArc(options: QueryArcOptions): string[];
  moveToward(instanceId: string, target: EntityPosition | string, options: MoveTowardOptions): EntityPosition | null;
  /**
   * Marks the `grid` broadphase index stale so the next `inRadius`/`queryArc` call rebuilds it from
   * `candidates()` and `resolvePosition()`. Call this after moving, spawning, or despawning a
   * candidate; a candidate absent from the index at query time is never skipped (it falls back to
   * an exact check), but a candidate that *moved* since the last rebuild can be missed until you
   * invalidate — so treat "invalidate after any position change" as the contract, not an
   * optimization. A no-op when no `grid` config was supplied. Safe to call every tick.
   */
  invalidate(): void;
}

export function distanceBetween(a: EntityPosition, b: EntityPosition): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function forwardXZ(aim: Aim): readonly [number, number] | null {
  if ("origin" in aim) {
    const [x, , z] = aim.direction;
    const length = Math.sqrt(x * x + z * z);
    if (length === 0) return null;
    return [x / length, z / length];
  }
  return [Math.sin(aim.yaw), Math.cos(aim.yaw)];
}

function cellCoord(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

function gridCellKey(cx: number, cz: number): string {
  return `${cx}:${cz}`;
}

interface GridIndex {
  cells: Map<string, string[]>;
  indexed: Set<string>;
}

export function createSpatialApi(options: SpatialApiOptions): SpatialApi {
  const { resolvePosition, candidates, occluder, grid } = options;
  const cellSize = grid?.cellSize;
  let gridIndex: GridIndex | null = null;
  let gridDirty = true;

  function resolveTarget(target: EntityPosition | string): EntityPosition | undefined {
    return typeof target === "string" ? resolvePosition(target) : target;
  }

  function ensureGrid(): GridIndex | null {
    if (cellSize === undefined) return null;
    if (!gridDirty && gridIndex !== null) return gridIndex;
    const cells = new Map<string, string[]>();
    const indexed = new Set<string>();
    for (const instanceId of candidates()) {
      const position = resolvePosition(instanceId);
      if (position === undefined) continue;
      indexed.add(instanceId);
      const key = gridCellKey(cellCoord(position[0], cellSize), cellCoord(position[2], cellSize));
      let bucket = cells.get(key);
      if (bucket === undefined) {
        bucket = [];
        cells.set(key, bucket);
      }
      bucket.push(instanceId);
    }
    gridIndex = { cells, indexed };
    gridDirty = false;
    return gridIndex;
  }

  function inRangeSet(index: GridIndex, centerX: number, centerZ: number, radius: number): Set<string> {
    const size = cellSize!;
    const cxMin = cellCoord(centerX - radius, size);
    const cxMax = cellCoord(centerX + radius, size);
    const czMin = cellCoord(centerZ - radius, size);
    const czMax = cellCoord(centerZ + radius, size);
    const near = new Set<string>();
    for (let cz = czMin; cz <= czMax; cz += 1) {
      for (let cx = cxMin; cx <= cxMax; cx += 1) {
        const bucket = index.cells.get(gridCellKey(cx, cz));
        if (bucket === undefined) continue;
        for (const id of bucket) near.add(id);
      }
    }
    return near;
  }

  return {
    distance(aInstanceId, bInstanceId) {
      const a = resolvePosition(aInstanceId);
      const b = resolvePosition(bInstanceId);
      if (a === undefined || b === undefined) return null;
      return distanceBetween(a, b);
    },
    inRadius(center, radius, filter) {
      const centerId = typeof center === "string" ? center : null;
      const centerPosition = resolveTarget(center);
      if (centerPosition === undefined) return [];
      const index = ensureGrid();
      const near = index === null ? null : inRangeSet(index, centerPosition[0], centerPosition[2], radius);
      return candidates().filter((instanceId) => {
        if (instanceId === centerId) return false;
        if (filter !== undefined && !filter(instanceId)) return false;
        if (near !== null && index!.indexed.has(instanceId) && !near.has(instanceId)) return false;
        const position = resolvePosition(instanceId);
        return position !== undefined && distanceBetween(centerPosition, position) <= radius;
      });
    },
    hasLineOfSight(fromInstanceId, toInstanceId) {
      const from = resolvePosition(fromInstanceId);
      const to = resolvePosition(toInstanceId);
      if (from === undefined || to === undefined) return false;
      if (occluder === undefined) return true;
      return !occluder(from, to);
    },
    queryArc({ from, aim, radius, halfAngleDeg = 60 }) {
      const origin = "origin" in aim ? aim.origin : resolvePosition(from);
      if (origin === undefined) return [];
      const forward = forwardXZ(aim);
      if (forward === null) return [];
      const minDot = Math.cos((halfAngleDeg * Math.PI) / 180);
      const index = ensureGrid();
      const near = index === null ? null : inRangeSet(index, origin[0], origin[2], radius);
      return candidates().filter((instanceId) => {
        if (instanceId === from) return false;
        if (near !== null && index!.indexed.has(instanceId) && !near.has(instanceId)) return false;
        const position = resolvePosition(instanceId);
        if (position === undefined) return false;
        const dx = position[0] - origin[0];
        const dz = position[2] - origin[2];
        const planarDistance = Math.sqrt(dx * dx + dz * dz);
        if (planarDistance > radius) return false;
        if (planarDistance === 0) return true;
        const dot = (forward[0] * dx + forward[1] * dz) / planarDistance;
        return dot >= minDot;
      });
    },
    invalidate() {
      gridDirty = true;
    },
    moveToward(instanceId, target, { speed, stopDistance = 0, dt }) {
      const current = resolvePosition(instanceId);
      const destination = resolveTarget(target);
      if (current === undefined || destination === undefined) return null;
      const total = distanceBetween(current, destination);
      const remaining = total - stopDistance;
      if (remaining <= 0) return current;
      const step = Math.min(speed * dt, remaining);
      const scale = step / total;
      return [
        current[0] + (destination[0] - current[0]) * scale,
        current[1] + (destination[1] - current[1]) * scale,
        current[2] + (destination[2] - current[2]) * scale,
      ];
    },
  };
}
