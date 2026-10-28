// @skill jgengine-world
import type { PlantMesh } from "../mesh/plantMesh";
import type { PlantStructure } from "../structure/plantStructure";
import { decodePlantMesh, decodePlantStructure, encodePlantMesh, encodePlantStructure } from "./plantCodec";

/**
 * Where cached plants persist between sessions: bytes by key. IndexedDB in a browser
 * ({@link createIndexedDbPlantCacheStorage}), memory in tests and tools, or anything with the same shape.
 * @capability plant-cache cache grown plant structures and styled meshes in memory and injected storage
 */
export interface PlantCacheStorage {
  get(key: string): Promise<Uint8Array | undefined>;
  set(key: string, bytes: Uint8Array): Promise<void>;
}

/**
 * A storage that keeps bytes in a map: for tests, tools and servers.
 * @capability plant-cache cache grown plant structures and styled meshes in memory and injected storage
 */
export function createMemoryPlantCacheStorage(): PlantCacheStorage & { keys(): string[] } {
  const entries = new Map<string, Uint8Array>();
  return {
    get: (key) => Promise.resolve(entries.get(key)),
    set: (key, bytes) => {
      entries.set(key, bytes);
      return Promise.resolve();
    },
    keys: () => [...entries.keys()],
  };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
  });
}

const PLANT_DB_STORE = "entries";
// One connection per database name for the page's lifetime, shared by every storage over it.
const plantDatabases = new Map<string, Promise<IDBDatabase>>();

function openPlantDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const known = plantDatabases.get(name);
  if (known !== undefined) return known;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(name, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PLANT_DB_STORE)) req.result.createObjectStore(PLANT_DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
  plantDatabases.set(name, opening);
  opening.catch(() => plantDatabases.delete(name));
  return opening;
}

/**
 * A storage over the browser's IndexedDB, or null where there is none (bun, node, a locked-down
 * frame). Failures read as misses, so a full or blocked database only costs regrowing.
 * @capability plant-cache cache grown plant structures and styled meshes in memory and injected storage
 */
export function createIndexedDbPlantCacheStorage(name = "jgengine-plants"): PlantCacheStorage | null {
  const factory = typeof indexedDB === "undefined" ? undefined : indexedDB;
  if (factory === undefined) return null;
  const store = PLANT_DB_STORE;
  const open = (): Promise<IDBDatabase> => openPlantDatabase(factory, name);
  return {
    async get(key) {
      try {
        const db = await open();
        const value: unknown = await request(db.transaction(store, "readonly").objectStore(store).get(key));
        return value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, bytes) {
      try {
        const db = await open();
        await request(db.transaction(store, "readwrite").objectStore(store).put(bytes, key));
      } catch {
        // A full or blocked database only means the plant regrows next time.
      }
    },
  };
}

/** A structure with the hash every mesh built from it carries. */
export interface CachedPlantStructure {
  structure: PlantStructure;
  hash: string;
}

/** Counters of a {@link PlantCache}'s memory tier. */
export interface PlantCacheState {
  structures: number;
  meshes: number;
  bytes: number;
  memoryBytes: number;
}

/** Options for {@link createPlantCache}. */
export interface PlantCacheOptions {
  /** Persistent tier; null keeps plants in memory only. */
  storage?: PlantCacheStorage | null;
  /** Most bytes the memory tier holds before it drops the least recently used entries. Default 192 MB. */
  memoryBytes?: number;
}

/**
 * Grown structures and styled meshes by key: a byte-bounded memory tier answers at once, the
 * storage tier survives reloads.
 * @capability plant-cache cache grown plant structures and styled meshes in memory and injected storage
 */
export interface PlantCache {
  structure(key: string): CachedPlantStructure | undefined;
  mesh(key: string): PlantMesh | undefined;
  /** Memory first, then storage (decoded into memory). */
  loadStructure(key: string): Promise<CachedPlantStructure | undefined>;
  loadMesh(key: string): Promise<PlantMesh | undefined>;
  /** Into memory now, and into storage in the background. */
  putStructure(key: string, entry: CachedPlantStructure): void;
  putMesh(key: string, mesh: PlantMesh): void;
  /** Swap the persistent tier, e.g. to a game's own database name. */
  setStorage(storage: PlantCacheStorage | null): void;
  /** Resolves once every background write so far has landed. */
  flush(): Promise<void>;
  state(): PlantCacheState;
  /** Empty the memory tier; storage keeps its entries. */
  reset(): void;
}

const DEFAULT_MEMORY_BYTES = 192 * 1024 * 1024;

function structureBytes(structure: PlantStructure): number {
  let bytes = structure.crownHull.byteLength;
  for (const array of Object.values(structure.segments)) bytes += array.byteLength;
  for (const array of Object.values(structure.leaves)) bytes += array.byteLength;
  for (const level of structure.clusters.levels) for (const array of Object.values(level)) bytes += array.byteLength;
  return bytes;
}

function meshBytes(mesh: PlantMesh): number {
  let bytes = 0;
  for (const part of [mesh.bark, mesh.leaves]) bytes += part.positions.byteLength + part.normals.byteLength + part.colors.byteLength + part.indices.byteLength;
  return bytes;
}

type Entry = { kind: "structure"; value: CachedPlantStructure; bytes: number } | { kind: "mesh"; value: PlantMesh; bytes: number };

/**
 * A plant cache over injected storage.
 * @capability plant-cache cache grown plant structures and styled meshes in memory and injected storage
 */
export function createPlantCache(options: PlantCacheOptions = {}): PlantCache {
  let storage = options.storage ?? null;
  const memoryBytes = options.memoryBytes ?? DEFAULT_MEMORY_BYTES;
  const memory = new Map<string, Entry>();
  let bytes = 0;
  let writes: Promise<void> = Promise.resolve();

  const touch = (key: string): Entry | undefined => {
    const entry = memory.get(key);
    if (entry === undefined) return undefined;
    memory.delete(key);
    memory.set(key, entry);
    return entry;
  };
  const remember = (key: string, entry: Entry): void => {
    const previous = memory.get(key);
    if (previous !== undefined) bytes -= previous.bytes;
    memory.delete(key);
    memory.set(key, entry);
    bytes += entry.bytes;
    for (const [oldest, old] of memory) {
      if (bytes <= memoryBytes || oldest === key) break;
      memory.delete(oldest);
      bytes -= old.bytes;
    }
  };
  const persist = (key: string, encode: () => Uint8Array): void => {
    const target = storage;
    if (target === null) return;
    writes = writes.then(() => target.set(key, encode())).catch(() => undefined);
  };

  const structureAt = (key: string): CachedPlantStructure | undefined => {
    const entry = touch(key);
    return entry?.kind === "structure" ? entry.value : undefined;
  };
  const meshAt = (key: string): PlantMesh | undefined => {
    const entry = touch(key);
    return entry?.kind === "mesh" ? entry.value : undefined;
  };

  return {
    structure: structureAt,
    mesh: meshAt,
    async loadStructure(key) {
      const known = structureAt(key);
      if (known !== undefined || storage === null) return known;
      const stored = await storage.get(key);
      if (stored === undefined) return undefined;
      try {
        const value = decodePlantStructure(stored);
        remember(key, { kind: "structure", value, bytes: structureBytes(value.structure) });
        return value;
      } catch {
        return undefined;
      }
    },
    async loadMesh(key) {
      const known = meshAt(key);
      if (known !== undefined || storage === null) return known;
      const stored = await storage.get(key);
      if (stored === undefined) return undefined;
      try {
        const value = decodePlantMesh(stored);
        remember(key, { kind: "mesh", value, bytes: meshBytes(value) });
        return value;
      } catch {
        return undefined;
      }
    },
    putStructure(key, entry) {
      remember(key, { kind: "structure", value: entry, bytes: structureBytes(entry.structure) });
      persist(key, () => encodePlantStructure(entry.structure, entry.hash));
    },
    putMesh(key, mesh) {
      remember(key, { kind: "mesh", value: mesh, bytes: meshBytes(mesh) });
      persist(key, () => encodePlantMesh(mesh));
    },
    setStorage(next) {
      storage = next;
    },
    flush: () => writes,
    state() {
      let structures = 0;
      let meshes = 0;
      for (const entry of memory.values()) {
        if (entry.kind === "structure") structures += 1;
        else meshes += 1;
      }
      return { structures, meshes, bytes, memoryBytes };
    },
    reset() {
      memory.clear();
      bytes = 0;
    },
  };
}
