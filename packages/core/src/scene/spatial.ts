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
  cellSize: number;
}

export interface SpatialApiOptions {
  resolvePosition: (instanceId: string) => EntityPosition | undefined;
  candidates: () => readonly string[];
  /**
   * When omitted, `hasLineOfSight` always returns true for known entities (open-field bypass).
   * Wire a wall/collision test here for combat LoS; `true` means the segment is blocked.
   */
  occluder?: (from: EntityPosition, to: EntityPosition) => boolean;
  /**
   * Broadphase for `inRadius`/`queryArc`. Defaults to `{ cellSize: 8 }`. Pass `false` to force a
   * linear scan. When enabled, the index rebuilds lazily on first use after `invalidate()` or when
   * `getVersion()` advances — call `invalidate()` after moves unless a version source is wired.
   */
  grid?: SpatialGridOptions | false;
  /** When this number changes between queries, the grid rebuilds without an explicit `invalidate()`. */
  getVersion?: () => number;
}

export interface SpatialApi {
  distance(aInstanceId: string, bInstanceId: string): number | null;
  inRadius(center: EntityPosition | string, radius: number, filter?: (instanceId: string) => boolean): string[];
  hasLineOfSight(fromInstanceId: string, toInstanceId: string): boolean;
  queryArc(options: QueryArcOptions): string[];
  moveToward(instanceId: string, target: EntityPosition | string, options: MoveTowardOptions): EntityPosition | null;
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

const CELL_KEY_OFFSET = 0x8000;

function packCell(cx: number, cz: number): number {
  return ((cx + CELL_KEY_OFFSET) << 16) | ((cz + CELL_KEY_OFFSET) & 0xffff);
}

interface GridIndex {
  cells: Map<number, string[]>;
  indexed: Set<string>;
  bucketPool: string[][];
  poolCursor: number;
}

const DEFAULT_CELL_SIZE = 8;

export function createSpatialApi(options: SpatialApiOptions): SpatialApi {
  const { resolvePosition, candidates, occluder, getVersion } = options;
  const gridConfig = options.grid === false ? undefined : (options.grid ?? { cellSize: DEFAULT_CELL_SIZE });
  const cellSize = gridConfig?.cellSize;
  let gridIndex: GridIndex | null = null;
  let gridDirty = true;
  let lastVersion: number | undefined;

  function resolveTarget(target: EntityPosition | string): EntityPosition | undefined {
    return typeof target === "string" ? resolvePosition(target) : target;
  }

  function takeBucket(index: GridIndex): string[] {
    if (index.poolCursor < index.bucketPool.length) {
      const bucket = index.bucketPool[index.poolCursor]!;
      index.poolCursor += 1;
      bucket.length = 0;
      return bucket;
    }
    const bucket: string[] = [];
    index.bucketPool.push(bucket);
    index.poolCursor += 1;
    return bucket;
  }

  function ensureGrid(): GridIndex | null {
    if (cellSize === undefined) return null;
    const version = getVersion?.();
    if (version !== undefined && version !== lastVersion) {
      gridDirty = true;
      lastVersion = version;
    }
    if (!gridDirty && gridIndex !== null) return gridIndex;

    const previous = gridIndex;
    const cells = previous?.cells ?? new Map<number, string[]>();
    cells.clear();
    const indexed = previous?.indexed ?? new Set<string>();
    indexed.clear();
    const index: GridIndex = {
      cells,
      indexed,
      bucketPool: previous?.bucketPool ?? [],
      poolCursor: 0,
    };

    for (const instanceId of candidates()) {
      const position = resolvePosition(instanceId);
      if (position === undefined) continue;
      indexed.add(instanceId);
      const key = packCell(cellCoord(position[0], cellSize), cellCoord(position[2], cellSize));
      let bucket = cells.get(key);
      if (bucket === undefined) {
        bucket = takeBucket(index);
        cells.set(key, bucket);
      }
      bucket.push(instanceId);
    }
    gridIndex = index;
    gridDirty = false;
    return index;
  }

  function collectNear(
    index: GridIndex,
    centerX: number,
    centerZ: number,
    radius: number,
    out: string[],
  ): void {
    const size = cellSize!;
    const cxMin = cellCoord(centerX - radius, size);
    const cxMax = cellCoord(centerX + radius, size);
    const czMin = cellCoord(centerZ - radius, size);
    const czMax = cellCoord(centerZ + radius, size);
    out.length = 0;
    const seen = collectNearSeen;
    seen.clear();
    for (let cz = czMin; cz <= czMax; cz += 1) {
      for (let cx = cxMin; cx <= cxMax; cx += 1) {
        const bucket = index.cells.get(packCell(cx, cz));
        if (bucket === undefined) continue;
        for (const id of bucket) {
          if (seen.has(id)) continue;
          seen.add(id);
          out.push(id);
        }
      }
    }
  }

  const collectNearSeen = new Set<string>();
  const nearScratch: string[] = [];
  const resultScratch: string[] = [];

  function appendUnindexed(index: GridIndex, out: string[]): void {
    for (const instanceId of candidates()) {
      if (index.indexed.has(instanceId)) continue;
      out.push(instanceId);
    }
  }

  function filterInRadius(
    ids: readonly string[],
    centerId: string | null,
    centerPosition: EntityPosition,
    radius: number,
    filter: ((instanceId: string) => boolean) | undefined,
  ): string[] {
    resultScratch.length = 0;
    for (const instanceId of ids) {
      if (instanceId === centerId) continue;
      if (filter !== undefined && !filter(instanceId)) continue;
      const position = resolvePosition(instanceId);
      if (position !== undefined && distanceBetween(centerPosition, position) <= radius) {
        resultScratch.push(instanceId);
      }
    }
    return resultScratch.slice();
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
      if (index === null) {
        return filterInRadius(candidates(), centerId, centerPosition, radius, filter);
      }
      collectNear(index, centerPosition[0], centerPosition[2], radius, nearScratch);
      appendUnindexed(index, nearScratch);
      return filterInRadius(nearScratch, centerId, centerPosition, radius, filter);
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
      const ids: readonly string[] =
        index === null
          ? candidates()
          : (collectNear(index, origin[0], origin[2], radius, nearScratch),
            appendUnindexed(index, nearScratch),
            nearScratch);
      resultScratch.length = 0;
      for (const instanceId of ids) {
        if (instanceId === from) continue;
        const position = resolvePosition(instanceId);
        if (position === undefined) continue;
        const dx = position[0] - origin[0];
        const dz = position[2] - origin[2];
        const planarDistance = Math.sqrt(dx * dx + dz * dz);
        if (planarDistance > radius) continue;
        if (planarDistance === 0) {
          resultScratch.push(instanceId);
          continue;
        }
        const dot = (forward[0] * dx + forward[1] * dz) / planarDistance;
        if (dot >= minDot) resultScratch.push(instanceId);
      }
      return resultScratch.slice();
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
