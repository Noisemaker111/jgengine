import { defaultKeyValueStorage, type KeyValueStorage } from "../game/keyValueStore";
import { hashString } from "../random/rng";

/**
 * The one async storage seam a save store persists through. Every backend
 * satisfies this same shape — the browser's `localStorage` (offline), an
 * in-memory map (tests/SSR), or a database/Convex/HTTP endpoint (cloud) — so a
 * game switches offline saves for cloud saves by swapping the backend and
 * changing nothing else. Keys are opaque namespaced strings; values are
 * already-serialized strings, so a backend never needs to know the save shape.
 *
 * A backend rejects any operation it could not carry out. It never resolves a
 * write it did not keep or answers `null` for a read that failed: the save store
 * turns those rejections into the `failed` results a game shows the player.
 * Every backend runs the same contract, `describeSaveBackend` in `saveBackendKit.ts`.
 */
export interface SaveBackend {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Every stored key that starts with `prefix`. The save store lists slots from these, so two stores or two tabs on one backend can never drop each other's slot. */
  keys(prefix: string): Promise<string[]>;
}

export interface SaveStorage extends KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
}

/**
 * A {@link SaveBackend} over a synchronous {@link SaveStorage} — the browser's
 * `localStorage` by default (offline, on-device saves) or a test stub. Every
 * failed operation rejects with the storage's own error, and missing storage
 * rejects every operation, so a save never reads as kept when it was not. Use
 * {@link memorySaveBackend} for deliberate ephemeral persistence.
 *
 * @capability local-save persist a game to on-device localStorage (offline)
 */
export function localSaveBackend(storage?: SaveStorage | null): SaveBackend {
  const resolve = (): SaveStorage => {
    const store =
      storage === undefined
        ? (defaultKeyValueStorage((error) => {
            throw error;
          }) as SaveStorage | null)
        : storage;
    if (store === null) throw new Error("Local storage is unavailable");
    return store;
  };
  return {
    read: async (key) => resolve().getItem(key),
    write: async (key, value) => resolve().setItem(key, value),
    remove: async (key) => resolve().removeItem(key),
    async keys(prefix) {
      const store = resolve();
      const found: string[] = [];
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key !== null && key.startsWith(prefix)) found.push(key);
      }
      return found;
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
    keys: (prefix) => Promise.resolve([...map.keys()].filter((key) => key.startsWith(prefix))),
  };
}

/** Adopt any async `read`/`write`/`remove`/`keys` set as a {@link SaveBackend} — the seam for cloud saves backed by a database, an HTTP endpoint, or Convex (see `@jgengine/convex/convexSaveBackend`). Operations reject on failure; the save store reports it as a `failed` result. */
export function remoteSaveBackend(backend: SaveBackend): SaveBackend {
  return backend;
}

export type SaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

export type SaveResult = { readonly kind: "saved"; readonly savedAt: number } | { readonly kind: "failed"; readonly error: unknown };

/**
 * What reading a slot found, with the live value after the read:
 * - `loaded`: a payload was read and is now the value;
 * - `empty`: the slot holds nothing, the value is `initial`;
 * - `corrupt`: the bytes could not be decoded or migrated. They were copied to `keptAt` before
 *   anything could overwrite them, and the value is `initial`;
 * - `failed`: the backend could not be read; the value is unchanged.
 */
export type LoadResult<T> =
  | { readonly kind: "loaded"; readonly value: T; readonly savedAt: number }
  | { readonly kind: "empty"; readonly value: T }
  | { readonly kind: "corrupt"; readonly value: T; readonly error: unknown; readonly keptAt: string }
  | { readonly kind: "failed"; readonly value: T; readonly error: unknown };

/** What reading a slot without applying it found — a save-select menu's row. A damaged or unreadable slot is reported, never shown as empty. */
export type PeekResult<T> =
  | { readonly kind: "loaded"; readonly value: T; readonly savedAt: number }
  | { readonly kind: "empty" }
  | { readonly kind: "corrupt"; readonly error: unknown }
  | { readonly kind: "failed"; readonly error: unknown };

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

export interface SaveEnvelope<T> {
  version: number;
  savedAt: number;
  value: T;
}

export interface SaveStoreConfig<T> {
  backend: SaveBackend;
  initial: T;
  key?: string;
  slot?: string | undefined;
  version?: number | undefined;
  migrate?: ((data: unknown, fromVersion: number) => T) | undefined;
  autosave?: boolean | SaveAutoConfig | undefined;
  serialize?: (envelope: SaveEnvelope<T>) => string;
  deserialize?: (raw: string) => unknown;
  /** Injectable clock (ms). Default `Date.now`. */
  now?: (() => number) | undefined;
  timers?: SaveTimers | undefined;
  onError?: ((error: unknown) => void) | undefined;
}

/**
 * A pluggable-backend game save with autosave, named slots, and versioned
 * migration. `value()`/`patch()` hold the live state; `load()` hydrates it from
 * the backend; `save()` (or autosave) writes it back. Each call resolves with
 * what happened — a save never throws into a tick and never reads as kept when
 * the backend refused it.
 */
export interface SaveStore<T> {
  value(): T;
  status(): SaveStatus;
  slot(): string;
  /** Monotonic change counter — bumps on any value or status change; drive `useSyncExternalStore` off it. */
  revision(): number;
  load(): Promise<LoadResult<T>>;
  set(value: T): void;
  patch(mutate: (previous: T) => T): T;
  save(): Promise<SaveResult>;
  clear(): Promise<boolean>;
  deleteSlot(slot: string): Promise<boolean>;
  peek(slot?: string): Promise<PeekResult<T>>;
  /**
   * Switch to `slot` and load it, flushing dirty state first unless `flush` is false. When that flush
   * fails, or the new slot cannot be read, the store stays on the old slot with its value, and the
   * result is `failed`.
   */
  switchSlot(slot: string, options?: { flush?: boolean }): Promise<LoadResult<T>>;
  slots(): Promise<string[]>;
  subscribe(listener: () => void): () => void;
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
    typeof (value as Record<string, unknown>)["version"] === "number" &&
    "value" in value
  );
}

const naturalOrder = new Intl.Collator(undefined, { numeric: true });

/**
 * The backend key a damaged payload is copied to before the slot can be written again. It sits
 * outside the `<namespace>:` prefix, so it never lists as a slot, and it is named by the bytes, so
 * reading the same damage twice keeps one copy.
 */
export function damagedSaveKey(namespace: string, slot: string, raw: string): string {
  return `${namespace}~damaged:${slot}:${hashString(raw).toString(36)}`;
}

/** Where builds before 0.60 kept a second list of slots; slots are read from the backend's keys now. */
const RETIRED_SLOT_INDEX = "__slots__";

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
  let saveChain: Promise<unknown> = Promise.resolve();
  let disposed = false;
  /** Slots whose damaged bytes could not be copied aside: writing them would destroy the only copy. */
  const unkept = new Set<string>();

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
  function fail(error: unknown): void {
    setStatus("error");
    onError?.(error);
  }

  const slotPrefix = `${namespace}:`;
  const dataKey = (slot: string): string => `${slotPrefix}${slot}`;

  function decode(raw: string): { value: T; savedAt: number } {
    const parsed = deserialize(raw);
    if (isEnvelope(parsed)) {
      const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
      if (parsed.version === formatVersion) return { value: parsed.value as T, savedAt };
      if (config.migrate) return { value: config.migrate(parsed.value, parsed.version), savedAt };
      return { value: parsed.value as T, savedAt };
    }
    if (config.migrate) return { value: config.migrate(parsed, 0), savedAt: 0 };
    return { value: parsed as T, savedAt: 0 };
  }

  /** Decode a slot's bytes; on damage copy them aside first, so no later write can lose them. */
  async function readSlot(
    slot: string,
  ): Promise<{ kind: "loaded"; value: T; savedAt: number } | { kind: "empty" } | { kind: "corrupt"; error: unknown; keptAt: string } | { kind: "failed"; error: unknown }> {
    let raw: string | null;
    try {
      raw = await backend.read(dataKey(slot));
    } catch (error) {
      return { kind: "failed", error };
    }
    if (raw === null) return { kind: "empty" };
    try {
      return { kind: "loaded", ...decode(raw) };
    } catch (error) {
      const keptAt = damagedSaveKey(namespace, slot, raw);
      try {
        await backend.write(keptAt, raw);
      } catch (keepError) {
        unkept.add(slot);
        return { kind: "failed", error: keepError };
      }
      unkept.delete(slot);
      return { kind: "corrupt", error, keptAt };
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

  async function flush(): Promise<SaveResult> {
    if (disposed) return { kind: "failed", error: new Error("The save store was disposed") };
    clearTimer();
    const slot = currentSlot;
    const value = current;
    if (unkept.has(slot)) {
      const error = new Error(`Slot "${slot}" holds damaged bytes that could not be copied aside; writing would destroy them`);
      fail(error);
      return { kind: "failed", error };
    }
    setStatus("saving");
    const savedAt = clock();
    try {
      await backend.write(dataKey(slot), serialize({ version: formatVersion, savedAt, value }));
    } catch (error) {
      fail(error);
      return { kind: "failed", error };
    }
    if (current === value) {
      dirty = false;
      firstDirtyAt = null;
    }
    setStatus("saved");
    return { kind: "saved", savedAt };
  }

  function save(): Promise<SaveResult> {
    const run = saveChain.then(() => flush());
    saveChain = run;
    return run;
  }

  async function load(): Promise<LoadResult<T>> {
    setStatus("loading");
    const read = await readSlot(currentSlot);
    if (read.kind === "failed") {
      fail(read.error);
      return { kind: "failed", value: current, error: read.error };
    }
    current = read.kind === "loaded" ? read.value : initial;
    dirty = false;
    firstDirtyAt = null;
    if (read.kind === "corrupt") fail(read.error);
    else setStatus("idle");
    emit();
    if (read.kind === "loaded") return { kind: "loaded", value: current, savedAt: read.savedAt };
    if (read.kind === "corrupt") return { kind: "corrupt", value: current, error: read.error, keptAt: read.keptAt };
    return { kind: "empty", value: current };
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
      setStatus("saving");
      try {
        await backend.remove(dataKey(currentSlot));
      } catch (error) {
        fail(error);
        return false;
      }
      current = initial;
      dirty = false;
      firstDirtyAt = null;
      setStatus("idle");
      emit();
      return true;
    },
    async deleteSlot(slot) {
      const wasActive = slot === currentSlot;
      if (wasActive) clearTimer();
      const run = saveChain.then(async (): Promise<boolean> => {
        if (wasActive) setStatus("saving");
        try {
          const existing = await backend.read(dataKey(slot));
          if (existing !== null) await backend.remove(dataKey(slot));
          if (wasActive) {
            current = initial;
            dirty = false;
            firstDirtyAt = null;
            setStatus("idle");
          }
          emit();
          return existing !== null;
        } catch (error) {
          fail(error);
          return false;
        }
      });
      saveChain = run;
      return run;
    },
    async switchSlot(slot, options) {
      clearTimer();
      if (options?.flush === false) await saveChain;
      else if (dirty) {
        const flushed = await save();
        if (flushed.kind === "failed") return { kind: "failed", value: current, error: flushed.error };
      }
      const left = { slot: currentSlot, value: current, dirty, firstDirtyAt };
      currentSlot = slot;
      current = initial;
      dirty = false;
      firstDirtyAt = null;
      const result = await load();
      if (result.kind !== "failed") return result;
      // An unreadable slot is not opened: staying on it would let the next save overwrite what it holds.
      currentSlot = left.slot;
      current = left.value;
      dirty = left.dirty;
      firstDirtyAt = left.firstDirtyAt;
      emit();
      return { kind: "failed", value: current, error: result.error };
    },
    async peek(slot = currentSlot) {
      const read = await readSlot(slot);
      if (read.kind === "failed" || read.kind === "corrupt") onError?.(read.error);
      if (read.kind === "corrupt") return { kind: "corrupt", error: read.error };
      return read;
    },
    async slots() {
      const slots = (await backend.keys(slotPrefix)).map((key) => key.slice(slotPrefix.length));
      if (slots.includes(RETIRED_SLOT_INDEX)) await backend.remove(dataKey(RETIRED_SLOT_INDEX));
      return slots.filter((slot) => slot !== RETIRED_SLOT_INDEX).sort(naturalOrder.compare);
    },
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
