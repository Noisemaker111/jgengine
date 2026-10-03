import type { GeneratedBuilding } from "./buildings";
import { resolveStructureBuildings } from "./environmentSummary";
import type { EnvironmentWorldFeature } from "./features";
import type { Aabb, Vec2 } from "./geometry";
import type { WallSegment } from "./walls";

/** One solid box in world space: the collision half of generated or authored world geometry. */
export interface WorldSolid {
  center: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
  /** Yaw about `center`, radians, in the engine's `rotationY` convention. Default `0`. */
  rotationY?: number;
}

/** Serializable contents of a {@link WorldSolids}: every layer's solids by layer id. */
export interface WorldSolidsState {
  layers: Record<string, readonly WorldSolid[]>;
}

/** Caller-owned work counters, reset by each world-solid ray candidate query. */
export interface WorldSolidRayWork {
  /** Hash-grid cell lookups, including empty cells. */
  cells: number;
  /** Indexed entry visits, including duplicates removed before bounds tests. */
  entries: number;
  /** Cached AABB ray tests after deduplication. */
  bounds: number;
}

/**
 * Static collision for world geometry that is not a scene object: generated buildings, studio
 * volumes like `city`, wall runs. Solids live in named layers so a feature can replace or drop its
 * own set without touching the rest. `solidObstaclesNear` (player and NPC movement),
 * `syncWorldColliders` (physics backends) and `populateNavGridFromSolids` all read this one store.
 */
export interface WorldSolids {
  /** Replace a layer's solids; an empty list removes the layer. */
  set(layer: string, solids: readonly WorldSolid[]): void;
  remove(layer: string): void;
  /** Run several `set`/`remove` calls as one change: one index rebuild, one notification. */
  batch(apply: () => void): void;
  /** Solids in one layer, empty when absent. */
  layer(layer: string): readonly WorldSolid[];
  layers(): readonly string[];
  /** Every solid whose world AABB overlaps `min`..`max`. Bounded by a uniform XZ hash grid. */
  inBox(min: readonly [number, number, number], max: readonly [number, number, number]): WorldSolid[];
  /** Optional accelerated ray candidates; finite coordinates/direction and nonnegative finite distance, normalized internally. */
  inRay?(origin: readonly [number, number, number], direction: readonly [number, number, number], maxDistance: number, work?: WorldSolidRayWork): WorldSolid[];
  /** Every solid in every layer. */
  all(): WorldSolid[];
  count(): number;
  /** Bumps on every change; cheap cache key for consumers. */
  version(): number;
  subscribe(listener: () => void): () => void;
  snapshot(): WorldSolidsState;
  restore(state: WorldSolidsState): void;
}

interface IndexedSolid {
  solid: WorldSolid;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  stamp: number;
}

const DEFAULT_CELL_SIZE = 16;
/** A solid covering more cells than this goes on an always-checked list instead of flooding the grid. */
const MAX_CELLS_PER_SOLID = 256;
const CELL_OFFSET = 32768;

/**
 * Yaw-expanded world AABB of an oriented solid box.
 * @capability world-solid-bounds world AABB and nav footprint of a world solid
 */
export function worldSolidBounds(solid: WorldSolid): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const yaw = solid.rotationY ?? 0;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const [hx, hy, hz] = solid.halfExtents;
  const ex = hx * cos + hz * sin;
  const ez = hx * sin + hz * cos;
  const [cx, cy, cz] = solid.center;
  return { min: [cx - ex, cy - hy, cz - ez], max: [cx + ex, cy + hy, cz + ez] };
}

/**
 * XZ footprint of a solid's world AABB, for 2D consumers such as nav grids.
 * @capability world-solid-bounds world AABB and nav footprint of a world solid
 */
export function worldSolidFootprint(solid: WorldSolid): Aabb {
  const { min, max } = worldSolidBounds(solid);
  return { minX: min[0], minZ: min[2], maxX: max[0], maxZ: max[2] };
}

/**
 * A store of static world solids in named layers.
 * @capability world-solids collision for generated and authored world geometry (buildings, city lots, walls)
 */
export function createWorldSolids(options: { cellSize?: number } = {}): WorldSolids {
  const cellSize = options.cellSize ?? DEFAULT_CELL_SIZE;
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError("World solid cellSize must be finite and positive");
  const layerMap = new Map<string, IndexedSolid[]>();
  const grid = new Map<number, IndexedSolid[]>();
  const oversize: IndexedSolid[] = [];
  const listeners = new Set<() => void>();
  let stamp = 0;
  let total = 0;
  let revision = 0;
  let batchDepth = 0;
  let pending = false;

  const cellOf = (value: number) => Math.floor(value / cellSize);
  const keyOf = (ix: number, iz: number) => (ix + CELL_OFFSET) * 65536 + (iz + CELL_OFFSET);

  function index(entry: IndexedSolid): void {
    const x0 = cellOf(entry.minX);
    const x1 = cellOf(entry.maxX);
    const z0 = cellOf(entry.minZ);
    const z1 = cellOf(entry.maxZ);
    if (![x0, x1, z0, z1].every(Number.isSafeInteger) || (x1 - x0 + 1) * (z1 - z0 + 1) > MAX_CELLS_PER_SOLID) {
      oversize.push(entry);
      return;
    }
    for (let ix = x0; ix <= x1; ix += 1) {
      for (let iz = z0; iz <= z1; iz += 1) {
        const key = keyOf(ix, iz);
        const bucket = grid.get(key);
        if (bucket === undefined) grid.set(key, [entry]);
        else bucket.push(entry);
      }
    }
  }

  function rebuildIndex(): void {
    grid.clear();
    oversize.length = 0;
    total = 0;
    for (const entries of layerMap.values()) {
      for (const entry of entries) index(entry);
      total += entries.length;
    }
  }

  function changed(): void {
    if (batchDepth > 0) {
      pending = true;
      return;
    }
    pending = false;
    rebuildIndex();
    revision += 1;
    for (const listener of listeners) listener();
  }

  function indexed(solid: WorldSolid): IndexedSolid {
    const { min, max } = worldSolidBounds(solid);
    return { solid, minX: min[0], minY: min[1], minZ: min[2], maxX: max[0], maxY: max[1], maxZ: max[2], stamp: 0 };
  }

  function overlaps(entry: IndexedSolid, min: readonly number[], max: readonly number[]): boolean {
    return (
      entry.maxX >= min[0]! &&
      entry.minX <= max[0]! &&
      entry.maxY >= min[1]! &&
      entry.minY <= max[1]! &&
      entry.maxZ >= min[2]! &&
      entry.minZ <= max[2]!
    );
  }

  function rayOverlaps(entry: IndexedSolid, origin: readonly number[], direction: readonly number[], maxDistance: number): boolean {
    let near = 0;
    let far = maxDistance;
    for (let axis = 0; axis < 3; axis++) {
      const min = axis === 0 ? entry.minX : axis === 1 ? entry.minY : entry.minZ;
      const max = axis === 0 ? entry.maxX : axis === 1 ? entry.maxY : entry.maxZ;
      const from = origin[axis]!;
      const delta = direction[axis]!;
      if (delta === 0) {
        if (from < min || from > max) return false;
        continue;
      }
      const a = (min - from) / delta;
      const b = (max - from) / delta;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
    return true;
  }

  return {
    set(layer, solids) {
      if (solids.length === 0) {
        if (!layerMap.delete(layer)) return;
      } else {
        layerMap.set(layer, solids.map(indexed));
      }
      changed();
    },
    remove(layer) {
      if (layerMap.delete(layer)) changed();
    },
    batch(apply) {
      batchDepth += 1;
      try {
        apply();
      } finally {
        batchDepth -= 1;
      }
      if (batchDepth === 0 && pending) changed();
    },
    layer: (layer) => layerMap.get(layer)?.map((entry) => entry.solid) ?? [],
    layers: () => [...layerMap.keys()],
    inBox(min, max) {
      stamp += 1;
      const out: WorldSolid[] = [];
      if (total === 0) return out;
      const x0 = cellOf(min[0]);
      const x1 = cellOf(max[0]);
      const z0 = cellOf(min[2]);
      const z1 = cellOf(max[2]);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > grid.size) {
        for (const entries of layerMap.values()) {
          for (const entry of entries) if (overlaps(entry, min, max)) out.push(entry.solid);
        }
        return out;
      }
      for (let ix = x0; ix <= x1; ix += 1) {
        for (let iz = z0; iz <= z1; iz += 1) {
          const bucket = grid.get(keyOf(ix, iz));
          if (bucket === undefined) continue;
          for (const entry of bucket) {
            if (entry.stamp === stamp) continue;
            entry.stamp = stamp;
            if (overlaps(entry, min, max)) out.push(entry.solid);
          }
        }
      }
      for (const entry of oversize) if (overlaps(entry, min, max)) out.push(entry.solid);
      return out;
    },
    inRay(origin, direction, maxDistance, work) {
      if (work !== undefined) { work.cells = 0; work.entries = 0; work.bounds = 0; }
      if (!origin.every(Number.isFinite) || !direction.every(Number.isFinite) || !Number.isFinite(maxDistance) || maxDistance < 0) {
        throw new RangeError("World solid rays require finite coordinates, direction and nonnegative distance");
      }
      const length = Math.hypot(...direction);
      if (!Number.isFinite(length)) throw new RangeError("World solid ray direction length must be finite");
      const out: WorldSolid[] = [];
      if (length === 0 || total === 0) return out;
      const normalized = [direction[0] / length, direction[1] / length, direction[2] / length];
      stamp++;
      const consider = (entry: IndexedSolid): void => {
        if (work !== undefined) work.entries++;
        if (entry.stamp === stamp) return;
        entry.stamp = stamp;
        if (work !== undefined) work.bounds++;
        if (rayOverlaps(entry, origin, normalized, maxDistance)) out.push(entry.solid);
      };
      const scan = (): void => {
        for (const entries of layerMap.values()) for (const entry of entries) consider(entry);
      };
      const visit = (x: number, z: number): void => {
        if (work !== undefined) work.cells++;
        const bucket = grid.get(keyOf(x, z));
        if (bucket !== undefined) for (const entry of bucket) consider(entry);
      };
      let x = cellOf(origin[0]);
      let z = cellOf(origin[2]);
      const stepX = Math.sign(normalized[0]!);
      const stepZ = Math.sign(normalized[2]!);
      const deltaX = stepX === 0 ? Infinity : cellSize / Math.abs(normalized[0]!);
      const deltaZ = stepZ === 0 ? Infinity : cellSize / Math.abs(normalized[2]!);
      let nextX = stepX === 0 ? Infinity : ((x + (stepX > 0 ? 1 : 0)) * cellSize - origin[0]) / normalized[0]!;
      let nextZ = stepZ === 0 ? Infinity : ((z + (stepZ > 0 ? 1 : 0)) * cellSize - origin[2]) / normalized[2]!;
      const estimatedCells = 3 * (Math.ceil(maxDistance * Math.abs(normalized[0]!) / cellSize) + Math.ceil(maxDistance * Math.abs(normalized[2]!) / cellSize) + 1);
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z) || estimatedCells > total) {
        scan();
        return out;
      }
      if (grid.size > 0) {
        visit(x, z);
        while (Math.min(nextX, nextZ) <= maxDistance) {
          const crossX = nextX <= nextZ;
          const crossZ = nextZ <= nextX;
          if (crossX && crossZ) {
            visit(x + stepX, z);
            visit(x, z + stepZ);
          }
          const oldX = x;
          const oldZ = z;
          const oldNextX = nextX;
          const oldNextZ = nextZ;
          if (crossX) { x += stepX; nextX += deltaX; }
          if (crossZ) { z += stepZ; nextZ += deltaZ; }
          if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z) ||
            (crossX && (x === oldX || nextX <= oldNextX)) || (crossZ && (z === oldZ || nextZ <= oldNextZ))) {
            scan();
            return out;
          }
          visit(x, z);
        }
      }
      for (const entry of oversize) consider(entry);
      return out;
    },
    all: () => [...layerMap.values()].flatMap((entries) => entries.map((entry) => entry.solid)),
    count: () => total,
    version: () => revision,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot() {
      const layers: Record<string, readonly WorldSolid[]> = {};
      for (const [layer, entries] of layerMap) layers[layer] = entries.map((entry) => entry.solid);
      return { layers };
    },
    restore(state) {
      layerMap.clear();
      for (const [layer, solids] of Object.entries(state.layers)) {
        if (solids.length > 0) layerMap.set(layer, solids.map(indexed));
      }
      changed();
    },
  };
}

/**
 * One solid per generated building: its `bounds` footprint turned by `rotationY` about `center`,
 * from the ground under its center up through its floors. `groundHeight` defaults to flat `0`.
 * @capability world-solids-from-data derive collision boxes from generated buildings and wall runs
 */
export function buildingSolids(
  buildings: readonly GeneratedBuilding[],
  groundHeight: (x: number, z: number) => number = () => 0,
): WorldSolid[] {
  return buildings.map((building) => {
    const { bounds, center } = building;
    const yaw = building.rotationY ?? 0;
    const localX = (bounds.minX + bounds.maxX) / 2 - center[0];
    const localZ = (bounds.minZ + bounds.maxZ) / 2 - center[1];
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const base = groundHeight(center[0], center[1]);
    const halfHeight = (building.floors * building.floorHeight) / 2;
    return {
      center: [center[0] + localX * cos + localZ * sin, base + halfHeight, center[1] - localX * sin + localZ * cos],
      halfExtents: [(bounds.maxX - bounds.minX) / 2, halfHeight, (bounds.maxZ - bounds.minZ) / 2],
      ...(yaw === 0 ? {} : { rotationY: yaw }),
    };
  });
}

/**
 * Solids for every `structures` descriptor on an environment feature, skipping any marked `solid: false`.
 * @capability world-solids-from-data derive collision boxes from generated buildings and wall runs
 */
export function structureSolids(
  world: EnvironmentWorldFeature,
  groundHeight?: (x: number, z: number) => number,
): WorldSolid[] {
  const solids: WorldSolid[] = [];
  for (const descriptor of world.structures ?? []) {
    if (descriptor.solid === false) continue;
    solids.push(...buildingSolids(resolveStructureBuildings(descriptor), groundHeight));
  }
  return solids;
}

/** Wall height, thickness and base for {@link wallSolids}. */
export interface WallSolidOptions {
  height: number;
  thickness: number;
  /** Ground height under a point; the wall stands on it at each segment's midpoint. Default flat `0`. */
  groundHeight?: (x: number, z: number) => number;
}

/**
 * One oriented solid per wall segment (see `wallSegments` in `world/walls`).
 * @capability world-solids-from-data derive collision boxes from generated buildings and wall runs
 */
export function wallSolids(segments: readonly WallSegment[], options: WallSolidOptions): WorldSolid[] {
  return segments
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const mid: Vec2 = [(segment.from[0] + segment.to[0]) / 2, (segment.from[1] + segment.to[1]) / 2];
      const base = options.groundHeight?.(mid[0], mid[1]) ?? 0;
      // Local x runs along the segment: rotationY maps local +x to (cos, -sin) in XZ.
      const yaw = -Math.atan2(segment.to[1] - segment.from[1], segment.to[0] - segment.from[0]);
      return {
        center: [mid[0], base + options.height / 2, mid[1]],
        halfExtents: [segment.length / 2, options.height / 2, options.thickness / 2],
        rotationY: yaw,
      };
    });
}
