import { createObservableKeyedStore } from "../store/observableKeyedStore";
import type { ModelAnimationConfig } from "../game/playableGame";
import type { InventoryState } from "../inventory/inventoryModel";
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
  /**
   * Per-placement rig animation override applied on top of catalog resolution — the same shape as
   * `ModelConfig.animation` (role→clip states, `"auto"`/`"none"`, speeds, fade, one-shot bindings).
   * Authored in the editor as `marker.meta.animation` (#1274) and threaded here by
   * `resolveAuthoredObjects` → `placeAuthoredObjects`; `undefined` keeps the catalog-resolved default.
   */
  animation?: ModelAnimationConfig | "auto" | "none";
  /**
   * Opaque per-instance state for this placement — a chest's locked flag, a machine's fill level, the
   * owner of a placed turret. Replicated and saved with the object through the `objects` snapshot
   * module and round-trips as `RuntimeObjectRow.flags`, so a command may own it without the game
   * hand-rolling a parallel store keyed by `instanceId`.
   */
  state?: Record<string, unknown>;
  /**
   * Container contents when this object's catalog entry declares `slotInventory`. Mutate through
   * `ctx.scene.object.slots` rather than writing it directly — that path validates against the
   * declared `accepts` and stack limits.
   */
  slots?: InventoryState;
}

export interface PlaceOptions {
  instanceId?: string;
  parentSpace?: string;
  rotation?: number;
  visual?: ObjectVisual;
  /** Initial {@link SceneObject.state} for this placement. */
  state?: Record<string, unknown>;
  /** Initial {@link SceneObject.slots} contents; omit to start from the catalog `slotInventory` layout's empty slots. */
  slots?: InventoryState;
  /** Per-placement rig animation override stored on the placed {@link SceneObject}; same shape as `ModelConfig.animation`. Omit to keep the catalog-resolved default. */
  animation?: ModelAnimationConfig | "auto" | "none";
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
  /** Replace {@link SceneObject.state} wholesale; `undefined` drops the field. Returns `false` when the instance is not placed. */
  setState(instanceId: string, state: Record<string, unknown> | undefined): boolean;
  /** Shallow-merge `patch` into {@link SceneObject.state}; a key set to `undefined` is removed. Returns `false` when the instance is not placed. */
  patchState(instanceId: string, patch: Record<string, unknown>): boolean;
  /** Replace {@link SceneObject.slots} wholesale; prefer `ctx.scene.object.slots` which validates against the catalog layout. */
  setSlots(instanceId: string, slots: InventoryState | undefined): boolean;
  get(instanceId: string): SceneObject | null;
  list(filter?: ObjectListFilter): readonly SceneObject[];
  /** Stable-identity list of all placed object ids; identity changes only on place/remove, not on move/rotate/setVisual. Pair with {@link subscribeMembership} for membership-only React subscriptions (#625). */
  ids(): readonly string[];
  at(x: number, y: number, z: number, tolerance?: number): SceneObject[];
  inBox(min: EntityPosition, max: EntityPosition): readonly SceneObject[];
  clear(): void;
  subscribe(listener: () => void): () => void;
  /** Notified only when the object set changes (place/remove), never on move/rotate/setVisual — markers read live poses imperatively. */
  subscribeMembership(listener: () => void): () => void;
  snapshot(): readonly SceneObject[];
  /** Replace the placed set with `objects` — the client half of `objects` replication; instances absent from the payload are removed. */
  hydrate(objects: readonly SceneObject[]): void;
}

const CELL_SIZE = 1;

/**
 * When an `inBox` query spans more than this many 1 m cells, walk the object list instead of the
 * cell grid. Tall/wide colliders (city buildings) can inflate movement broadphase to hundreds of
 * metres on each axis — at 1 m cells that is O(10⁶) empty `Map.get`s per frame and freezes `pose`.
 * Linear scan over a few hundred objects is cheaper the moment the cell volume exceeds the scene.
 */
const IN_BOX_CELL_VOLUME_LIMIT = 4096;

function cellIndexOf(value: number): number {
  return Math.floor(value / CELL_SIZE);
}

function cellKey(cx: number, cy: number, cz: number): string {
  return `${cx}:${cy}:${cz}`;
}

function cellKeyOf(position: EntityPosition): string {
  return cellKey(cellIndexOf(position[0]), cellIndexOf(position[1]), cellIndexOf(position[2]));
}

function objectInAabb(object: SceneObject, min: EntityPosition, max: EntityPosition): boolean {
  const [x, y, z] = object.position;
  return x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2];
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
        ...(options.animation !== undefined ? { animation: options.animation } : {}),
        ...(options.state !== undefined ? { state: options.state } : {}),
        ...(options.slots !== undefined ? { slots: options.slots } : {}),
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
      const { visual: _cleared, ...rest } = current;
      store.set(instanceId, visual === undefined ? rest : { ...rest, visual });
      return true;
    },
    setState(instanceId, state) {
      const current = store.get(instanceId);
      if (!current) return false;
      const { state: _cleared, ...rest } = current;
      store.set(instanceId, state === undefined ? rest : { ...rest, state });
      return true;
    },
    patchState(instanceId, patch) {
      const current = store.get(instanceId);
      if (!current) return false;
      const state: Record<string, unknown> = { ...current.state };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete state[key];
        else state[key] = value;
      }
      const { state: _cleared, ...rest } = current;
      store.set(instanceId, Object.keys(state).length === 0 ? rest : { ...rest, state });
      return true;
    },
    setSlots(instanceId, slots) {
      const current = store.get(instanceId);
      if (!current) return false;
      const { slots: _cleared, ...rest } = current;
      store.set(instanceId, slots === undefined ? rest : { ...rest, slots });
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
    ids() {
      return store.keysSnapshot();
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
      const minCx = cellIndexOf(min[0]);
      const maxCx = cellIndexOf(max[0]);
      const minCy = cellIndexOf(min[1]);
      const maxCy = cellIndexOf(max[1]);
      const minCz = cellIndexOf(min[2]);
      const maxCz = cellIndexOf(max[2]);
      const cellsX = Math.max(0, maxCx - minCx + 1);
      const cellsY = Math.max(0, maxCy - minCy + 1);
      const cellsZ = Math.max(0, maxCz - minCz + 1);
      const cellVolume = cellsX * cellsY * cellsZ;
      // Huge queries (city-scale movement broadphase inflated by tall building colliders): scanning
      // every empty 1 m cell is far more expensive than testing the few hundred placed objects.
      if (cellVolume > IN_BOX_CELL_VOLUME_LIMIT) {
        const hits: SceneObject[] = [];
        for (const object of store.arraySnapshot()) {
          if (objectInAabb(object, min, max)) hits.push(object);
        }
        return hits;
      }
      const hits: SceneObject[] = [];
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        for (let cy = minCy; cy <= maxCy; cy += 1) {
          for (let cz = minCz; cz <= maxCz; cz += 1) {
            const bucket = cellIndex.get(cellKey(cx, cy, cz));
            if (bucket === undefined) continue;
            for (const instanceId of bucket) {
              const object = store.get(instanceId);
              if (object === undefined) continue;
              if (objectInAabb(object, min, max)) hits.push(object);
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
    subscribeMembership(listener) {
      return store.subscribeMembership(listener);
    },
    snapshot() {
      return store.arraySnapshot();
    },
    hydrate(objects) {
      const incoming = new Set(objects.map((object) => object.instanceId));
      for (const current of store.arraySnapshot()) {
        if (!incoming.has(current.instanceId)) {
          store.delete(current.instanceId);
          indexRemove(current.instanceId, current.position);
        }
      }
      for (const object of objects) {
        const current = store.get(object.instanceId);
        if (current !== undefined) indexRemove(object.instanceId, current.position);
        store.set(object.instanceId, object);
        indexAdd(object.instanceId, object.position);
      }
    },
  };
}

export function objectVisualScale(visual: ObjectVisual | undefined): readonly [number, number, number] {
  const scale = visual?.scale;
  if (scale === undefined) return [1, 1, 1];
  return typeof scale === "number" ? [scale, scale, scale] : scale;
}
