import {
  createSaveStore,
  type LoadResult,
  type PeekResult,
  type SaveBackend,
  type SaveResult,
  type SaveStatus,
  type SaveTimers,
} from "./saveStore";
import type { WorldSnapshot } from "../runtime/worldSnapshot";

/**
 * The narrow slice of a live `GameContext` a runtime save reads and writes — a
 * `GameContext` satisfies it directly (`ctx.state`/`ctx.restore`/`ctx.subscribe`).
 * Depending on this instead of the full context keeps the save controller a deep,
 * decoupled module: it captures and restores the *whole* opted-in world without
 * knowing any subsystem.
 */
export interface RuntimeSaveTarget {
  snapshot(): WorldSnapshot;
  hydrate(snapshot: WorldSnapshot): void;
  state?(): WorldSnapshot;
  /** Authoritative inverse of `state`; used together with it instead of replication hydration. */
  restore?(state: WorldSnapshot): void;
  subscribe(listener: () => void): () => void;
}

/** `"autosave"` writes a fresh capture on a trailing timer while the world changes (at most once per `autosaveMs`, so a never-idle world still persists); `"manual"` writes only on an explicit `save()`/`checkpoint()` — the save-point / quest-trigger model. */
export type RuntimeSaveMode = "autosave" | "manual";

export interface RuntimeSaveConfig {
  target: RuntimeSaveTarget;
  /** Where the save lives — `localSaveBackend()` (offline) or a cloud/Convex backend; the only thing that changes between offline and cloud. */
  backend: SaveBackend;
  /** `"autosave"` (default) persists on world change; `"manual"` only when the game calls `save()`/`checkpoint()`. */
  mode?: RuntimeSaveMode | undefined;
  key?: string;
  slot?: string;
  version?: number | undefined;
  migrate?: ((data: unknown, fromVersion: number) => WorldSnapshot) | undefined;
  /** Trailing autosave interval (ms) for `autosave` mode — the world persists at most once per interval and always within one interval of its first unsaved change. Default `3000`. */
  autosaveMs?: number | undefined;
  now?: (() => number) | undefined;
  timers?: SaveTimers;
  onError?: (error: unknown) => void;
}

export type RuntimeSaveOptions = Omit<RuntimeSaveConfig, "target">;

/**
 * One stored slot as a save-select menu reads it: the world document a {@link RuntimeSave.load | load}
 * of that slot would restore, and the wall-clock time (ms) it was written. The document is a plain
 * {@link WorldSnapshot}, so a game reads its own systems out of it (commander, mission, playtime,
 * thumbnail) with the same keys `ctx.state()` writes.
 */
export interface RuntimeSave {
  readonly backend: SaveBackend;
  status(): SaveStatus;
  slot(): string;
  save(): Promise<SaveResult>;
  checkpoint(): Promise<SaveResult>;
  load(): Promise<LoadResult<WorldSnapshot>>;
  /** Delete the active slot's save. A pending autosave is cancelled, so the slot stays empty until the world changes again. Resolves `false` when the backend refused. */
  clear(): Promise<boolean>;
  switchSlot(slot: string): Promise<LoadResult<WorldSnapshot>>;
  slots(): Promise<string[]>;
  /**
   * Read any slot's stored world without applying it: no hydrate/restore, no slot switch, no write, no
   * status change. This is a save-select menu's data source, and `peek(slot())` gates a title screen's
   * Continue — the active slot's live session is left exactly as it was. A damaged or unreadable slot
   * is reported (and told to {@link RuntimeSaveConfig.onError}), never shown as empty; an older payload
   * resolves migrated through {@link RuntimeSaveConfig.migrate}, the same document `load()` would apply.
   */
  peek(slot: string): Promise<PeekResult<WorldSnapshot>>;
  /**
   * Delete one slot that is not active: its stored bytes and its entry in {@link RuntimeSave.slots} go,
   * and every other slot stays readable. Resolves `true` when bytes were removed, `false` for a slot
   * holding nothing and for the active slot, which it refuses — `clear()` owns that one.
   *
   * The active slot is refused because its state is the live world: deleting it would be silently
   * undone by the next autosave (the game is still playing that save), so a delete that sticks has to
   * come after leaving the slot.
   */
  deleteSlot(slot: string): Promise<boolean>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

function defaultTimers(): SaveTimers {
  return {
    set: (handler, ms) => globalThis.setTimeout(handler, ms),
    clear: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  };
}

function hasContent(snapshot: WorldSnapshot): boolean {
  for (const _key in snapshot) return true;
  return false;
}

/**
 * Bridge a live world to a pluggable save backend: whole-state capture/restore
 * with autosave, save points, named slots, and versioned migration — the same
 * call for offline (localStorage) and cloud (Convex), only the `backend`
 * differs. The game keeps control of *when* it saves (the `mode` plus explicit
 * `checkpoint()` calls from quests/areas) and *when* it restores (`load()` on
 * boot), so any save mechanic — continuous autosave, manual save points,
 * checkpoint triggers — is expressible without new engine code.
 *
 * @capability runtime-save save/load the whole game world through a pluggable backend, autosave or save points
 */
export function createRuntimeSave(config: RuntimeSaveConfig): RuntimeSave {
  const mode = config.mode ?? "autosave";
  const autosaveMs = config.autosaveMs ?? 3000;
  const timers = config.timers ?? defaultTimers();
  const store = createSaveStore<WorldSnapshot>({
    backend: config.backend,
    initial: {},
    key: config.key ?? "runtime",
    slot: config.slot,
    version: config.version,
    migrate: config.migrate,
    autosave: false,
    now: config.now,
    onError: config.onError,
  });

  let pendingTimer: unknown = null;
  let unsubscribe: (() => void) | null = null;
  let disposed = false;
  let restoring = false;

  function clearTimer(): void {
    if (pendingTimer !== null) {
      timers.clear(pendingTimer);
      pendingTimer = null;
    }
  }

  function persist(): Promise<SaveResult> {
    clearTimer();
    store.set(config.target.state?.() ?? config.target.snapshot());
    return store.save();
  }

  /**
   * Arm a trailing autosave. A living world (AI, physics, the day/night clock)
   * changes every frame, so a debounce that *reset* its timer on every change
   * would never elapse and the game would never persist — the timer would be
   * pushed forward faster than it could fire. Instead the first change since the
   * last write arms a single timer and later changes ride that same timer; when
   * it fires it captures the latest snapshot. The result is at most one write per
   * `autosaveMs`, and always within `autosaveMs` of the first unsaved change,
   * even while the world never stops moving.
   */
  function scheduleAutosave(): void {
    if (disposed || restoring || pendingTimer !== null) return;
    pendingTimer = timers.set(() => {
      pendingTimer = null;
      void persist();
    }, autosaveMs);
  }

  if (mode === "autosave") {
    unsubscribe = config.target.subscribe(scheduleAutosave);
  }

  function applyLoaded(result: LoadResult<WorldSnapshot>): LoadResult<WorldSnapshot> {
    if (result.kind !== "loaded" || !hasContent(result.value)) return result;
    restoring = true;
    try {
      if (config.target.restore !== undefined) config.target.restore(result.value);
      else config.target.hydrate(result.value);
    } finally {
      restoring = false;
    }
    return result;
  }

  const save = (): Promise<SaveResult> => persist();

  return {
    backend: config.backend,
    status: () => store.status(),
    slot: () => store.slot(),
    save,
    checkpoint: save,
    async load() {
      return applyLoaded(await store.load());
    },
    clear() {
      clearTimer();
      return store.clear();
    },
    async switchSlot(slot) {
      clearTimer();
      return applyLoaded(await store.switchSlot(slot));
    },
    slots: () => store.slots(),
    peek: (slot) => store.peek(slot),
    async deleteSlot(slot) {
      if (slot === store.slot()) return false;
      return store.deleteSlot(slot);
    },
    subscribe: (listener) => store.subscribe(listener),
    dispose() {
      disposed = true;
      clearTimer();
      if (unsubscribe !== null) unsubscribe();
      store.dispose();
    },
  };
}
