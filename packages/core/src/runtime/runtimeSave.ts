import {
  createSaveStore,
  type SaveBackend,
  type SaveStatus,
  type SaveTimers,
} from "../game/saveStore";
import type { WorldSnapshot } from "./worldSnapshot";

/**
 * The narrow slice of a live `GameContext` a runtime save reads and writes — a
 * `GameContext` satisfies it directly (`ctx.snapshot`/`ctx.hydrate`/`ctx.subscribe`).
 * Depending on this instead of the full context keeps the save controller a deep,
 * decoupled module: it captures and restores the *whole* opted-in world without
 * knowing any subsystem.
 */
export interface RuntimeSaveTarget {
  snapshot(): WorldSnapshot;
  hydrate(snapshot: WorldSnapshot): void;
  subscribe(listener: () => void): () => void;
}

/** `"autosave"` writes a fresh capture on a trailing timer while the world changes (at most once per `autosaveMs`, so a never-idle world still persists); `"manual"` writes only on an explicit `save()`/`checkpoint()` — the save-point / quest-trigger model. */
export type RuntimeSaveMode = "autosave" | "manual";

/** How {@link createRuntimeSave} is wired — the live world `target`, the `backend` it persists through, and optional mode/slot/versioning/cadence knobs. */
export interface RuntimeSaveConfig {
  /** The live world to capture from and restore into — pass the `GameContext`. */
  target: RuntimeSaveTarget;
  /** Where the save lives — `localSaveBackend()` (offline) or a cloud/Convex backend; the only thing that changes between offline and cloud. */
  backend: SaveBackend;
  /** `"autosave"` (default) persists on world change; `"manual"` only when the game calls `save()`/`checkpoint()`. */
  mode?: RuntimeSaveMode;
  /** Storage namespace. Default `"runtime"`. */
  key?: string;
  /** Active save slot. Default `"default"`. */
  slot?: string;
  /** Save-format version; bump + pass {@link migrate} on a breaking world-shape change. */
  version?: number;
  migrate?: (data: unknown, fromVersion: number) => WorldSnapshot;
  /** Trailing autosave interval (ms) for `autosave` mode — the world persists at most once per interval and always within one interval of its first unsaved change. Default `3000`. */
  autosaveMs?: number;
  now?: () => number;
  timers?: SaveTimers;
  onError?: (error: unknown) => void;
}

/** {@link RuntimeSaveConfig} without `target` — what a host (`createGameContext`) accepts to build `ctx.game.save` and bind it to the context itself. */
export type RuntimeSaveOptions = Omit<RuntimeSaveConfig, "target">;

/**
 * Whole-world save/load bound to a live world and a pluggable backend. `save()`
 * captures `target.snapshot()` and writes it; `load()` reads it back and
 * `target.hydrate()`s the whole world. In `autosave` mode it also writes on a
 * trailing timer while the world keeps changing. Named slots, versioned migration, and offline↔cloud
 * (backend swap) all come for free from the underlying save store.
 */
export interface RuntimeSave {
  status(): SaveStatus;
  slot(): string;
  /** Capture the live world and persist it now (serialized against any in-flight write). */
  save(): Promise<void>;
  /** Semantic alias for `save()` — call it from a save point, a quest-complete or area-enter handler. */
  checkpoint(): Promise<void>;
  /** Load the active slot and hydrate the whole world; resolves `true` when a real save was applied, `false` for an empty slot. */
  load(): Promise<boolean>;
  /** Whether the active slot holds a saved world — gate a title-screen "Continue" on it. */
  hasSave(): Promise<boolean>;
  /** Delete the active slot's save. */
  clear(): Promise<void>;
  /** Switch slot and load it, hydrating the world when that slot has a save. */
  switchSlot(slot: string): Promise<boolean>;
  /** The slots this game has written — back a load/save menu. */
  slots(): Promise<string[]>;
  subscribe(listener: () => void): () => void;
  /** Stop autosave and release the world subscription. */
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

  function persist(): Promise<void> {
    clearTimer();
    store.set(config.target.snapshot());
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

  function applyLoaded(snapshot: WorldSnapshot): boolean {
    if (!hasContent(snapshot)) return false;
    restoring = true;
    try {
      config.target.hydrate(snapshot);
    } finally {
      restoring = false;
    }
    return true;
  }

  const save = (): Promise<void> => persist();

  return {
    status: () => store.status(),
    slot: () => store.slot(),
    save,
    checkpoint: save,
    async load() {
      return applyLoaded(await store.load());
    },
    async hasSave() {
      return hasContent(await store.load());
    },
    clear: () => store.clear(),
    async switchSlot(slot) {
      clearTimer();
      return applyLoaded(await store.switchSlot(slot));
    },
    slots: () => store.slots(),
    subscribe: (listener) => store.subscribe(listener),
    dispose() {
      disposed = true;
      clearTimer();
      if (unsubscribe !== null) unsubscribe();
      store.dispose();
    },
  };
}
