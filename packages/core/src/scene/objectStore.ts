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
  clear(): void;
  subscribe(listener: () => void): () => void;
  snapshot(): readonly SceneObject[];
}

export function createObjectStore(): ObjectStore {
  const store = createObservableKeyedStore<SceneObject>();
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
      return instanceId;
    },
    remove(instanceId) {
      const existed = store.has(instanceId);
      store.delete(instanceId);
      return existed;
    },
    move(instanceId, x, y, z) {
      const current = store.get(instanceId);
      if (!current) return false;
      store.set(instanceId, { ...current, position: [x, y, z] });
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
    clear() {
      for (const object of store.arraySnapshot()) {
        store.delete(object.instanceId);
      }
    },
    subscribe(listener) {
      return store.subscribe(listener);
    },
    snapshot() {
      return store.arraySnapshot();
    },
  };
}
