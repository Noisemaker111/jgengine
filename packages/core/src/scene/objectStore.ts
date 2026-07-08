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
  at(x: number, y: number, z: number): SceneObject | null;
  inBox(min: EntityPosition, max: EntityPosition): readonly SceneObject[];
  clear(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): readonly SceneObject[];
}

function cellKey(x: number, y: number, z: number): string {
  return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
}

export function createObjectStore(): ObjectStore {
  const store = createObservableKeyedStore<SceneObject>();
  const cellIndex = new Map<string, string[]>();
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

  function indexInsert(instanceId: string, x: number, y: number, z: number): void {
    const key = cellKey(x, y, z);
    const bucket = cellIndex.get(key);
    if (bucket === undefined) {
      cellIndex.set(key, [instanceId]);
    } else {
      bucket.push(instanceId);
    }
  }

  function indexRemove(instanceId: string, x: number, y: number, z: number): void {
    const key = cellKey(x, y, z);
    const bucket = cellIndex.get(key);
    if (bucket === undefined) return;
    const at = bucket.indexOf(instanceId);
    if (at === -1) return;
    bucket.splice(at, 1);
    if (bucket.length === 0) cellIndex.delete(key);
  }

  return {
    place(catalogId, x, y, z, options = {}) {
      if (options.instanceId !== undefined && store.has(options.instanceId)) {
        throw new Error(`Scene object id "${options.instanceId}" is already placed.`);
      }
      const instanceId = options.instanceId ?? generateId();
      store.set(instanceId, {
        instanceId,
        catalogId,
        position: [x, y, z],
        rotationY: options.rotation ?? 0,
        ...(options.parentSpace !== undefined ? { parentSpace: options.parentSpace } : {}),
      });
      indexInsert(instanceId, x, y, z);
      return instanceId;
    },
    remove(instanceId) {
      const current = store.get(instanceId);
      if (current === undefined) return false;
      indexRemove(instanceId, current.position[0], current.position[1], current.position[2]);
      store.delete(instanceId);
      return true;
    },
    move(instanceId, x, y, z) {
      const current = store.get(instanceId);
      if (!current) return false;
      indexRemove(instanceId, current.position[0], current.position[1], current.position[2]);
      store.set(instanceId, { ...current, position: [x, y, z] });
      indexInsert(instanceId, x, y, z);
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
    at(x, y, z) {
      const bucket = cellIndex.get(cellKey(x, y, z));
      if (bucket === undefined || bucket.length === 0) return null;
      const instanceId = bucket[bucket.length - 1]!;
      return store.get(instanceId) ?? null;
    },
    inBox(min, max) {
      const hits: SceneObject[] = [];
      for (const bucket of cellIndex.values()) {
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
