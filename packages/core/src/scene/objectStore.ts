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
  /** Bumps whenever membership, a position or a rotation changes — cheap cache key for consumers. */
  version(): number;
  /** Bump {@link version} for a change the store cannot see, such as a consumer-owned collider set. */
  markSpatialChange(): void;
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
 * Queries above this many 1 m cells walk the coarse grid instead. A 1 m cell lookup hashes a fresh
 * string while an object test is a few comparisons, so the crossover is tens of cells — not the
 * thousands a "scan every object instead" comparison implied. A city movement box is hundreds.
 */
const IN_BOX_CELL_VOLUME_LIMIT = 32;

/**
 * Second index level for those big queries: coarse XZ columns hold the same centre points as the 1 m
 * grid, so a city-scale box walks a few populated columns instead of every object in the world.
 * Beyond {@link COARSE_CELL_VOLUME_LIMIT} (a world-sized query) a list walk is cheaper.
 */
const COARSE_CELL_SIZE = 16;
const COARSE_CELL_VOLUME_LIMIT = 4096;
/**
 * Two signed coarse axes packed into one small-integer key (no string allocation, no heap-number
 * hash): ±16384 cells covers ±262 km at 16 m and the key stays inside a 32-bit SMI.
 */
const COARSE_KEY_RADIX = 32768;
const COARSE_KEY_BIAS = 16384;
const COARSE_KEY_LIMIT = 16384;

function cellIndexOf(value: number): number {
  return Math.floor(value / CELL_SIZE);
}

function coarseIndexOf(value: number): number {
  return Math.floor(value / COARSE_CELL_SIZE);
}

function coarseKey(cx: number, cz: number): number {
  return (cx + COARSE_KEY_BIAS) * COARSE_KEY_RADIX + (cz + COARSE_KEY_BIAS);
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
  const coarseIndex = new Map<number, Set<string>>();
  let nextCounter = 1;
  let revision = 0;

  function generateId(): string {
    let id = `object-${nextCounter}`;
    while (store.has(id)) {
      nextCounter += 1;
      id = `object-${nextCounter}`;
    }
    nextCounter += 1;
    return id;
  }

  function coarseAdd(instanceId: string, position: EntityPosition): void {
    const cx = coarseIndexOf(position[0]);
    const cz = coarseIndexOf(position[2]);
    if (cx <= -COARSE_KEY_LIMIT || cx >= COARSE_KEY_LIMIT || cz <= -COARSE_KEY_LIMIT || cz >= COARSE_KEY_LIMIT) return;
    const key = coarseKey(cx, cz);
    let bucket = coarseIndex.get(key);
    if (bucket === undefined) {
      bucket = new Set();
      coarseIndex.set(key, bucket);
    }
    bucket.add(instanceId);
  }

  function coarseRemove(instanceId: string, position: EntityPosition): void {
    const cx = coarseIndexOf(position[0]);
    const cz = coarseIndexOf(position[2]);
    if (cx <= -COARSE_KEY_LIMIT || cx >= COARSE_KEY_LIMIT || cz <= -COARSE_KEY_LIMIT || cz >= COARSE_KEY_LIMIT) return;
    const key = coarseKey(cx, cz);
    const bucket = coarseIndex.get(key);
    if (bucket === undefined) return;
    bucket.delete(instanceId);
    if (bucket.size === 0) coarseIndex.delete(key);
  }

  function indexAdd(instanceId: string, position: EntityPosition): void {
    const key = cellKeyOf(position);
    let bucket = cellIndex.get(key);
    if (bucket === undefined) {
      bucket = new Set();
      cellIndex.set(key, bucket);
    }
    bucket.add(instanceId);
    coarseAdd(instanceId, position);
  }

  function indexRemove(instanceId: string, position: EntityPosition): void {
    const key = cellKeyOf(position);
    const bucket = cellIndex.get(key);
    if (bucket !== undefined) {
      bucket.delete(instanceId);
      if (bucket.size === 0) cellIndex.delete(key);
    }
    coarseRemove(instanceId, position);
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
      revision += 1;
      return instanceId;
    },
    remove(instanceId) {
      const current = store.get(instanceId);
      if (!current) return false;
      store.delete(instanceId);
      indexRemove(instanceId, current.position);
      revision += 1;
      return true;
    },
    move(instanceId, x, y, z) {
      const current = store.get(instanceId);
      if (!current) return false;
      const position: EntityPosition = [x, y, z];
      store.set(instanceId, { ...current, position });
      indexRemove(instanceId, current.position);
      indexAdd(instanceId, position);
      revision += 1;
      return true;
    },
    rotate(instanceId, rotationY) {
      const current = store.get(instanceId);
      if (!current) return false;
      store.set(instanceId, { ...current, rotationY });
      revision += 1;
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
      // Huge queries (city-scale movement broadphase inflated by tall building colliders): walking
      // every 1 m cell is all empty lookups, so walk the coarse grid instead.
      if (cellVolume > IN_BOX_CELL_VOLUME_LIMIT) {
        const coarseMinX = coarseIndexOf(min[0]);
        const coarseMaxX = coarseIndexOf(max[0]);
        const coarseMinZ = coarseIndexOf(min[2]);
        const coarseMaxZ = coarseIndexOf(max[2]);
        const coarseVolume = Math.max(0, coarseMaxX - coarseMinX + 1) * Math.max(0, coarseMaxZ - coarseMinZ + 1);
        if (
          coarseVolume > COARSE_CELL_VOLUME_LIMIT ||
          coarseMinX <= -COARSE_KEY_LIMIT || coarseMaxX >= COARSE_KEY_LIMIT ||
          coarseMinZ <= -COARSE_KEY_LIMIT || coarseMaxZ >= COARSE_KEY_LIMIT
        ) {
          const hits: SceneObject[] = [];
          for (const object of store.arraySnapshot()) {
            if (objectInAabb(object, min, max)) hits.push(object);
          }
          return hits;
        }
        const hits: SceneObject[] = [];
        for (let cx = coarseMinX; cx <= coarseMaxX; cx += 1) {
          const rowBase = (cx + COARSE_KEY_BIAS) * COARSE_KEY_RADIX + coarseMinZ + COARSE_KEY_BIAS;
          for (let cz = coarseMinZ; cz <= coarseMaxZ; cz += 1) {
            const bucket = coarseIndex.get(rowBase + (cz - coarseMinZ));
            if (bucket === undefined) continue;
            for (const instanceId of bucket) {
              const object = store.get(instanceId);
              if (object === undefined) continue;
              if (objectInAabb(object, min, max)) hits.push(object);
            }
          }
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
      coarseIndex.clear();
      revision += 1;
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
    version() {
      return revision;
    },
    markSpatialChange() {
      revision += 1;
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
      revision += 1;
    },
  };
}

export function objectVisualScale(visual: ObjectVisual | undefined): readonly [number, number, number] {
  const scale = visual?.scale;
  if (scale === undefined) return [1, 1, 1];
  return typeof scale === "number" ? [scale, scale, scale] : scale;
}
