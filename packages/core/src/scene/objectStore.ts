import { createObservableKeyedStore } from "../store/observableKeyedStore";
import type { EntityPosition } from "./entityStore";

export interface SceneObject {
  instanceId: string;
  catalogId: string;
  position: EntityPosition;
  rotationY: number;
  parentSpace?: string;
}

export interface PlaceOptions {
  instanceId?: string;
  parentSpace?: string;
  rotation?: number;
}

export interface ObjectListFilter {
  parentSpace?: string;
}

export interface ObjectStore {
  place(catalogId: string, x: number, y: number, z: number, options?: PlaceOptions): string;
  remove(instanceId: string): boolean;
  move(instanceId: string, x: number, y: number, z: number): boolean;
  rotate(instanceId: string, rotationY: number): boolean;
  get(instanceId: string): SceneObject | null;
  list(filter?: ObjectListFilter): readonly SceneObject[];
  at(x: number, y: number, z: number, tolerance?: number): SceneObject[];
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
      if (options.instanceId !== undefined && store.has(options.instanceId)) {
        throw new Error(`Scene object id "${options.instanceId}" is already placed.`);
      }
      const instanceId = options.instanceId ?? generateId();
      const position: EntityPosition = [x, y, z];
      store.set(instanceId, {
        instanceId,
        catalogId,
        position,
        rotationY: options.rotation ?? 0,
        ...(options.parentSpace !== undefined ? { parentSpace: options.parentSpace } : {}),
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
