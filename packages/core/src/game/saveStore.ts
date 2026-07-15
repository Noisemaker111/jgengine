import { defaultKeyValueStorage, type KeyValueStorage } from "./keyValueStore";

/**
 * The one async storage seam a save store persists through. Every backend
 * satisfies this same three-method shape — the browser's `localStorage`
 * (offline), an in-memory map (tests/SSR), or a database/Convex/HTTP endpoint
 * (cloud) — so a game switches offline saves for cloud saves by swapping the
 * backend and changing nothing else. Keys are opaque namespaced strings; values
 * are already-serialized strings, so a backend never needs to know the save
 * shape.
 */
export interface SaveBackend {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

function readSafe(storage: KeyValueStorage | null, key: string): string | null {
  if (storage === null) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * A {@link SaveBackend} over a synchronous {@link KeyValueStorage} — the
 * browser's `localStorage` by default (offline, on-device saves), a test stub,
 * or `null` for memory-only. Storage errors (quota exceeded, private mode, no
 * DOM) degrade to no-ops, so a save never throws into a game tick.
 *
 * @capability local-save persist a game to on-device localStorage (offline)
 */
export function localSaveBackend(storage?: KeyValueStorage | null): SaveBackend {
  const store = storage === undefined ? defaultKeyValueStorage() : storage;
  return {
    read: (key) => Promise.resolve(readSafe(store, key)),
    write: (key, value) => {
      if (store !== null) {
        try {
          store.setItem(key, value);
        } catch {
          // storage rejected the write; the store keeps the value in memory
        }
      }
      return Promise.resolve();
    },
    remove: (key) => {
      if (store !== null) {
        try {
          store.removeItem(key);
        } catch {
          // ignore removal failure
        }
      }
      return Promise.resolve();
    },
  };
}

/** A memory-only {@link SaveBackend} — saves survive a reload only within the same session. For tests, SSR, or a "no persistence" mode that still exercises the same save code path. */
export function memorySaveBackend(): SaveBackend {
  const map = new Map<string, string>();
  return {
    read: (key) => Promise.resolve(map.get(key) ?? null),
    write: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

/** Adopt any async `read`/`write`/`remove` trio as a {@link SaveBackend} — the seam for cloud saves backed by a database, an HTTP endpoint, or Convex (see `@jgengine/convex/convexSaveBackend`). Reads/writes may reject; the save store surfaces the failure as `"error"` status instead of throwing. */
export function remoteSaveBackend(backend: SaveBackend): SaveBackend {
  return backend;
}

/** Lifecycle of the last save/load — drive a "Saving…"/"Saved" indicator or a loading gate off it. `"error"` means the backend rejected a read or write. */
export type SaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

/** Autosave cadence: debounce writes `debounceMs` after the last edit, but never wait longer than `maxWaitMs` while edits keep coming (`0` removes the ceiling). `autosave: true` uses `{ debounceMs: 1000, maxWaitMs: 15000 }`. */
export interface SaveAutoConfig {
  debounceMs?: number;
  maxWaitMs?: number;
}

/** The timer seam autosave schedules through — defaults to the ambient `setTimeout`/`clearTimeout`; inject fakes in tests. */
export interface SaveTimers {
  set(handler: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/** The versioned envelope written to the backend — `version` lets a later game build detect and {@link SaveStoreConfig.migrate | migrate} an older payload. */
export interface SaveEnvelope<T> {
  version: number;
  savedAt: number;
  value: T;
}

/** How a {@link createSaveStore} is wired — the backend it persists through, the initial value, and optional slot/versioning/autosave/serialization knobs. */
export interface SaveStoreConfig<T> {
  /** Where saves live — {@link localSaveBackend}, {@link memorySaveBackend}, or a {@link remoteSaveBackend}. */
  backend: SaveBackend;
  /** The value a fresh save starts from (nothing stored yet, or after `clear`). */
  initial: T;
  /** Storage namespace, joined with the slot into the backend key. Default `"save"`. */
  key?: string;
  /** Active save slot — pass distinct slots for multiple parallel saves. Default `"default"`. */
  slot?: string;
  /** Current save-format version. Default `1`. Bump it on a breaking shape change and pass {@link migrate}. */
  version?: number;
  /** Upgrade an older payload to the current shape. Receives the stored value and the version it was written at (`0` for a pre-versioned/raw payload). */
  migrate?: (data: unknown, fromVersion: number) => T;
  /** Autosave on every `set`/`patch`. `false` (default) saves only on an explicit `save()`. */
  autosave?: boolean | SaveAutoConfig;
  serialize?: (envelope: SaveEnvelope<T>) => string;
  deserialize?: (raw: string) => unknown;
  /** Injectable clock (ms). Default `Date.now`. */
  now?: () => number;
  /** Injectable timers for autosave. Default ambient `setTimeout`/`clearTimeout`. */
  timers?: SaveTimers;
  /** Notified on any backend read/write failure — status is already `"error"` when it runs. */
  onError?: (error: unknown) => void;
}

/**
 * A pluggable-backend game save with autosave, named slots, and versioned
 * migration. `value()`/`patch()` hold the live state; `load()` hydrates it from
 * the backend; `save()` (or autosave) writes it back. Backend failures surface
 * as `"error"` status and through `onError` — a save never throws into a tick.
 */
export interface SaveStore<T> {
  value(): T;
  status(): SaveStatus;
  slot(): string;
  /** Monotonic change counter — bumps on any value or status change; drive `useSyncExternalStore` off it. */
  revision(): number;
  /** Hydrate the active slot from the backend into `value()`; corrupt payloads fall back to `initial`. */
  load(): Promise<T>;
  /** Replace the value and mark it dirty (schedules autosave). */
  set(value: T): void;
  /** Read-modify-write the value and mark it dirty; returns the next value. */
  patch(mutate: (previous: T) => T): T;
  /** Flush the current value to the backend now (serialized against in-flight saves). */
  save(): Promise<void>;
  /** Delete the active slot and reset `value()` to `initial`. */
  clear(): Promise<void>;
  /** Flush any dirty state, switch to `slot`, and load it. */
  switchSlot(slot: string): Promise<T>;
  /** The slots this store has written (for a load/save menu). */
  slots(): Promise<string[]>;
  subscribe(listener: () => void): () => void;
  /** Stop autosave timers and drop listeners. */
  dispose(): void;
}

function defaultTimers(): SaveTimers {
  return {
    set: (handler, ms) => globalThis.setTimeout(handler, ms),
    clear: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  };
}

function normalizeAuto(config: boolean | SaveAutoConfig | undefined): { debounceMs: number; maxWaitMs: number } | null {
  if (config === undefined || config === false) return null;
  if (config === true) return { debounceMs: 1000, maxWaitMs: 15000 };
  return { debounceMs: config.debounceMs ?? 1000, maxWaitMs: config.maxWaitMs ?? 15000 };
}

function isEnvelope(value: unknown): value is SaveEnvelope<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).version === "number" &&
    "value" in value
  );
}

/**
 * Create a {@link SaveStore}. Same call for offline and cloud — only the
 * `backend` differs (localStorage, memory, or an async DB/Convex endpoint). Turn
 * on `autosave` and every `set`/`patch` persists on a debounce; leave it off and
 * call `save()` at checkpoints. Bump `version` + pass `migrate` when the save
 * shape changes so old players keep their progress.
 *
 * @capability game-save save/load game state with a pluggable backend, autosave, slots, and migration
 */
export function createSaveStore<T>(config: SaveStoreConfig<T>): SaveStore<T> {
  const namespace = config.key ?? "save";
  const formatVersion = config.version ?? 1;
  const initial = config.initial;
  const backend = config.backend;
  const clock = config.now ?? (() => Date.now());
  const timers = config.timers ?? defaultTimers();
  const auto = normalizeAuto(config.autosave);
  const serialize = config.serialize ?? ((envelope: SaveEnvelope<T>) => JSON.stringify(envelope));
  const deserialize = config.deserialize ?? ((raw: string) => JSON.parse(raw) as unknown);
  const onError = config.onError;

  let currentSlot = config.slot ?? "default";
  let current = initial;
  let status: SaveStatus = "idle";
  let revision = 0;
  let dirty = false;
  let firstDirtyAt: number | null = null;
  let pendingTimer: unknown = null;
  let saveChain: Promise<void> = Promise.resolve();
  let disposed = false;

  const listeners = new Set<() => void>();
  function emit(): void {
    revision += 1;
    for (const listener of listeners) listener();
  }
  function setStatus(next: SaveStatus): void {
    if (status === next) return;
    status = next;
    emit();
  }
  function reportError(error: unknown): void {
    onError?.(error);
  }

  const dataKey = (slot: string): string => `${namespace}:${slot}`;
  const indexKey = (): string => `${namespace}:__slots__`;

  function decode(raw: string): T {
    const parsed = deserialize(raw);
    if (isEnvelope(parsed)) {
      if (parsed.version === formatVersion) return parsed.value as T;
      if (config.migrate) return config.migrate(parsed.value, parsed.version);
      return parsed.value as T;
    }
    if (config.migrate) return config.migrate(parsed, 0);
    return parsed as T;
  }

  async function readSlots(): Promise<string[]> {
    try {
      const raw = await backend.read(indexKey());
      if (raw === null) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
    } catch {
      return [];
    }
  }

  async function rememberSlot(slot: string): Promise<void> {
    try {
      const list = await readSlots();
      if (list.includes(slot)) return;
      await backend.write(indexKey(), JSON.stringify([...list, slot]));
    } catch (error) {
      reportError(error);
    }
  }

  async function forgetSlot(slot: string): Promise<void> {
    try {
      const list = await readSlots();
      if (!list.includes(slot)) return;
      await backend.write(indexKey(), JSON.stringify(list.filter((entry) => entry !== slot)));
    } catch (error) {
      reportError(error);
    }
  }

  function clearTimer(): void {
    if (pendingTimer !== null) {
      timers.clear(pendingTimer);
      pendingTimer = null;
    }
  }

  function markDirty(): void {
    dirty = true;
    if (auto === null) return;
    const now = clock();
    if (firstDirtyAt === null) firstDirtyAt = now;
    if (auto.maxWaitMs > 0 && now - firstDirtyAt >= auto.maxWaitMs) {
      clearTimer();
      void save();
      return;
    }
    clearTimer();
    pendingTimer = timers.set(() => {
      pendingTimer = null;
      void save();
    }, auto.debounceMs);
  }

  async function flush(): Promise<void> {
    if (disposed) return;
    clearTimer();
    const slot = currentSlot;
    const value = current;
    setStatus("saving");
    try {
      const envelope: SaveEnvelope<T> = { version: formatVersion, savedAt: clock(), value };
      await backend.write(dataKey(slot), serialize(envelope));
      await rememberSlot(slot);
      if (current === value) {
        dirty = false;
        firstDirtyAt = null;
      }
      setStatus("saved");
    } catch (error) {
      setStatus("error");
      reportError(error);
    }
  }

  function save(): Promise<void> {
    const run = saveChain.then(() => flush());
    saveChain = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<T> {
    setStatus("loading");
    try {
      const raw = await backend.read(dataKey(currentSlot));
      let value: T;
      try {
        value = raw === null ? initial : decode(raw);
      } catch {
        value = initial;
      }
      current = value;
      dirty = false;
      firstDirtyAt = null;
      setStatus("idle");
      emit();
      void rememberSlot(currentSlot);
      return current;
    } catch (error) {
      setStatus("error");
      reportError(error);
      return current;
    }
  }

  return {
    value: () => current,
    status: () => status,
    slot: () => currentSlot,
    revision: () => revision,
    load,
    set(value) {
      current = value;
      emit();
      markDirty();
    },
    patch(mutate) {
      current = mutate(current);
      emit();
      markDirty();
      return current;
    },
    save,
    async clear() {
      clearTimer();
      const slot = currentSlot;
      setStatus("saving");
      try {
        await backend.remove(dataKey(slot));
        await forgetSlot(slot);
        current = initial;
        dirty = false;
        firstDirtyAt = null;
        setStatus("idle");
        emit();
      } catch (error) {
        setStatus("error");
        reportError(error);
      }
    },
    async switchSlot(slot) {
      if (dirty) await save();
      clearTimer();
      currentSlot = slot;
      current = initial;
      dirty = false;
      firstDirtyAt = null;
      return load();
    },
    slots: readSlots,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      clearTimer();
      listeners.clear();
    },
  };
}
