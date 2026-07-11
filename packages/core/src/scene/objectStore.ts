import { createObservableKeyedStore } from "../store/observableKeyedStore";
import type { EntityPosition } from "./entityStore";

export interface ObjectVisual {
  scale?: number | readonly [number, number, number];
  color?: string;
  opacity?: number;
}

export interface SceneObject {
  instanceId: string;
  catalogId: string;
  position: EntityPosition;
  rotationY: number;
  parentSpace?: string;
  visual?: ObjectVisual;
}

export interface PlaceOptions {
  instanceId?: string;
  parentSpace?: string;
  rotation?: number;
  visual?: ObjectVisual;
  /** When `instanceId` is already placed: `"throw"` (default), `"replace"` (fresh placement over it — remount-safe world setup, #284.10), or `"keep"` (leave it untouched and return the id). */
  onExisting?: "throw" | "replace" | "keep";
}

export interface ObjectListFilter {
  parentSpace?: string;
}

export interface ObjectStore {
  place(catalogId: string, x: number, y: number, z: number, options?: PlaceOptions): string;
  remove(instanceId: string): boolean;
  move(instanceId: string, x: number, y: number, z: number): boolean;
  rotate(instanceId: string, rotationY: number): boolean;
  setVisual(instanceId: string, visual: ObjectVisual | undefined): boolean;
  get(instanceId: string): SceneObject | null;
  list(filter?: ObjectListFilter): readonly SceneObject[];
  at(x: number, y: number, z: number, tolerance?: number): SceneObject[];
  inBox(min: EntityPosition, max: EntityPosition): readonly SceneObject[];
  clear(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): readonly SceneObject[];
}

const CELL_SIZE = 1;

function cellIndexOf(value: number): number {
  return Math.floor(value / CELL_SIZE);
}

function cellKey(cx: number, cy: number, cz: number): string {
  return `${cx}:${cy}:${cz}`;
}

function cellKeyOf(position: EntityPosition): string {
  return cellKey(cellIndexOf(position[0]), cellIndexOf(position[1]), cellIndexOf(position[2]));
}

export function createObjectStore(): ObjectStore {
  const store = createObservableKeyedStore<SceneObject>();
  const cellIndex = new Map<string, Set<string>>();
  let nextCounter = 1;

  function generateId(): string {
    let id = `object-${nextCounter}`;
    while (store.has(id)) {
      nextCounter += 1;
      id = `object-${nextCounter}`;
    }
    nextCounter += 1;
    return id;
  }

  function indexAdd(instanceId: string, position: EntityPosition): void {
    const key = cellKeyOf(position);
    let bucket = cellIndex.get(key);
    if (bucket === undefined) {
      bucket = new Set();
      cellIndex.set(key, bucket);
    }
    bucket.add(instanceId);
  }

  function indexRemove(instanceId: string, position: EntityPosition): void {
    const key = cellKeyOf(position);
    const bucket = cellIndex.get(key);
    if (bucket === undefined) return;
    bucket.delete(instanceId);
    if (bucket.size === 0) cellIndex.delete(key);
  }

  return {
    place(catalogId, x, y, z, options = {}) {
      const existing = options.instanceId === undefined ? null : store.get(options.instanceId);
      if (existing !== null && existing !== undefined) {
        const onExisting = options.onExisting ?? "throw";
        if (onExisting === "keep") return options.instanceId!;
        if (onExisting === "throw") throw new Error(`Scene object id "${options.instanceId}" is already placed.`);
        indexRemove(options.instanceId!, existing.position);
      }
      const instanceId = options.instanceId ?? generateId();
      const position: EntityPosition = [x, y, z];
      store.set(instanceId, {
        instanceId,
        catalogId,
        position,
        rotationY: options.rotation ?? 0,
        ...(options.parentSpace !== undefined ? { parentSpace: options.parentSpace } : {}),
        ...(options.visual !== undefined ? { visual: options.visual } : {}),
      });
      indexAdd(instanceId, position);
      return instanceId;
    },
    remove(instanceId) {
      const current = store.get(instanceId);
      if (!current) return false;
      store.delete(instanceId);
      indexRemove(instanceId, current.position);
      return true;
    },
    move(instanceId, x, y, z) {
      const current = store.get(instanceId);
      if (!current) return false;
      const position: EntityPosition = [x, y, z];
      store.set(instanceId, { ...current, position });
      indexRemove(instanceId, current.position);
      indexAdd(instanceId, position);
      return true;
    },
    rotate(instanceId, rotationY) {
      const current = store.get(instanceId);
      if (!current) return false;
      store.set(instanceId, { ...current, rotationY });
      return true;
    },
    setVisual(instanceId, visual) {
      const current = store.get(instanceId);
      if (!current) return false;
      store.set(instanceId, {
        instanceId: current.instanceId,
        catalogId: current.catalogId,
        position: current.position,
        rotationY: current.rotationY,
        ...(current.parentSpace !== undefined ? { parentSpace: current.parentSpace } : {}),
        ...(visual !== undefined ? { visual } : {}),
      });
      return true;
    },
    get(instanceId) {
      return store.get(instanceId) ?? null;
    },
    list(filter) {
      const all = store.arraySnapshot();
      if (filter?.parentSpace === undefined) return all;
      return all.filter((object) => object.parentSpace === filter.parentSpace);
    },
    at(x, y, z, tolerance = 0) {
      const minCx = cellIndexOf(x - tolerance);
      const maxCx = cellIndexOf(x + tolerance);
      const minCy = cellIndexOf(y - tolerance);
      const maxCy = cellIndexOf(y + tolerance);
      const minCz = cellIndexOf(z - tolerance);
      const maxCz = cellIndexOf(z + tolerance);
      const results: SceneObject[] = [];
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        for (let cy = minCy; cy <= maxCy; cy += 1) {
          for (let cz = minCz; cz <= maxCz; cz += 1) {
            const bucket = cellIndex.get(cellKey(cx, cy, cz));
            if (bucket === undefined) continue;
            for (const instanceId of bucket) {
              const object = store.get(instanceId);
              if (object === undefined) continue;
              const dx = object.position[0] - x;
              const dy = object.position[1] - y;
              const dz = object.position[2] - z;
              if (Math.hypot(dx, dy, dz) <= tolerance) results.push(object);
            }
          }
        }
      }
      return results;
    },
    inBox(min, max) {
      const hits: SceneObject[] = [];
      const minCx = cellIndexOf(min[0]);
      const maxCx = cellIndexOf(max[0]);
      const minCy = cellIndexOf(min[1]);
      const maxCy = cellIndexOf(max[1]);
      const minCz = cellIndexOf(min[2]);
      const maxCz = cellIndexOf(max[2]);
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        for (let cy = minCy; cy <= maxCy; cy += 1) {
          for (let cz = minCz; cz <= maxCz; cz += 1) {
            const bucket = cellIndex.get(cellKey(cx, cy, cz));
            if (bucket === undefined) continue;
            for (const instanceId of bucket) {
              const object = store.get(instanceId);
              if (object === undefined) continue;
              const [x, y, z] = object.position;
              if (
                x >= min[0] && x <= max[0] &&
                y >= min[1] && y <= max[1] &&
                z >= min[2] && z <= max[2]
              ) {
                hits.push(object);
              }
            }
          }
        }
      }
      return hits;
    },
    clear() {
      for (const object of store.arraySnapshot()) {
        store.delete(object.instanceId);
      }
      cellIndex.clear();
    },
    subscribe(listener) {
      return store.subscribe(listener);
    },
    snapshot() {
      return store.arraySnapshot();
    },
  };
}

export function objectVisualScale(visual: ObjectVisual | undefined): readonly [number, number, number] {
  const scale = visual?.scale;
  if (scale === undefined) return [1, 1, 1];
  return typeof scale === "number" ? [scale, scale, scale] : scale;
}
