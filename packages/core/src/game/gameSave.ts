import { devtools } from "../devtools/devtools";
import { hashString, restoreRng, rngStateOf } from "../random/rng";
import {
  createSaveStore,
  type SaveAutoConfig,
  type SaveBackend,
  type SaveStatus,
  type SaveTimers,
} from "./saveStore";

/** Current save-format version of {@link GameSaveDocument}. Bump it with {@link GameSaveConfig.migrate} when the shape changes. */
export const GAME_SAVE_VERSION = 1;

/**
 * One stateful system inside a game save: a stable `name` (its section key in the document) and the
 * `snapshot()`/`restore()` pair every Lane B module exposes. The name is the contract — a document
 * written by one build restores into the next build's system with the same name. `reset` runs when a
 * loaded slot has no section for this system (a fresh slot), so switching to an empty slot starts a
 * new game instead of leaving the previous one's state behind; a system without it is left as-is.
 */
export interface GameSaveSystem<T = unknown> {
  readonly name: string;
  snapshot(): T;
  restore(next: T): void;
  reset?(): void;
}

/** The persisted cursor of the world's shared injected RNG, plus the seed that produced it. */
export interface GameSaveRngState {
  /** Seed the stream was created from, so a reload can rebuild the same sequence. */
  seed: string | number;
  /** The stream's cursor, or `null` for a generator that carries no state. */
  cursor: number | null;
}

/**
 * The one save document: a format `version`, the game and clock metadata a save-select menu shows,
 * the world's shared RNG cursor, and one section per registered system. There is deliberately no
 * second per-system format — every system's state lives under `systems[<name>]`.
 */
export interface GameSaveDocument {
  /** {@link GAME_SAVE_VERSION} this document was written at. */
  version: number;
  /** Stable game id, so a document names the game it belongs to. */
  game: string;
  /** Wall-clock time (ms) the document was captured. */
  savedAt: number;
  /** World clock (game seconds) at capture. */
  time: number;
  /** Seconds played at capture. */
  playtime: number;
  /** The shared RNG's seed and cursor, or `null` when the game injects no shared stream. */
  rng: GameSaveRngState | null;
  /** One entry per registered system, keyed by its name. */
  systems: Record<string, unknown>;
}

/** The world's shared injected RNG: its `seed` and the live `stream` whose cursor is persisted. */
export interface GameSaveRng {
  readonly seed: string | number;
  readonly stream: () => number;
}

/** How a {@link createGameSave} is wired. Storage is the narrow injected {@link SaveBackend}, never `localStorage` welded in. */
export interface GameSaveConfig {
  /** Where the document is written — {@link localSaveBackend}, {@link memorySaveBackend}, or a remote/cloud backend. */
  readonly backend: SaveBackend;
  /** Stable game id, stored in every document. */
  readonly game: string;
  /** Systems whose sections make up the document. More can be added later with `register`. */
  readonly systems?: readonly GameSaveSystem[];
  /** Save-format version. Default {@link GAME_SAVE_VERSION}. */
  readonly version?: number;
  /** The world's shared injected RNG. Its seed and cursor are stored so the same sequence resumes. */
  readonly rng?: GameSaveRng;
  /** World clock reader, in game seconds. Default `() => 0`. */
  readonly clock?: () => number;
  /** Playtime reader, in seconds. Default `() => 0`. */
  readonly playtime?: () => number;
  /** Active slot. Default `"default"`. */
  readonly slot?: string;
  /** Storage namespace. Default `game-save:<game>`. */
  readonly key?: string;
  /**
   * Autosave cadence, as caller policy: `false` (default) writes only on an explicit `save()`;
   * `true` debounces on the default window; an object sets its own debounce and ceiling.
   */
  readonly autosave?: boolean | SaveAutoConfig;
  /** Injectable clock (ms) for `savedAt`. Default `Date.now`. */
  readonly now?: () => number;
  /** Injectable timers for autosave. Default the ambient `setTimeout`/`clearTimeout`. */
  readonly timers?: SaveTimers;
  /**
   * Upgrade an older document to the current shape. Receives the stored document and the version it
   * was written at (`0` for a pre-versioned payload) and returns a document at {@link GameSaveConfig.version}.
   */
  readonly migrate?: (document: unknown, fromVersion: number) => GameSaveDocument;
  /** Notified on any backend read/write failure or a restored document written by another world. */
  readonly onError?: (error: unknown) => void;
  /** Register a devtools probe under this name so the overlay shows the slot, status and system count. */
  readonly devtoolsName?: string;
}

/**
 * A pluggable-backend game save: one versioned document holding a section per system, with named
 * slots, caller-policy autosave, migration and a state digest. `capture()` builds the document from
 * the live systems; `save()`/`touch()` write it (directly or on the autosave debounce); `load()`
 * reads a slot and applies every section back through its system's `restore`. The shared RNG's
 * cursor rides along, so the seed survives the save and a reloaded run continues the same sequence.
 */
export interface GameSave {
  /** Register a system after construction; returns an unregister fn. Throws on a duplicate name. */
  register(system: GameSaveSystem): () => void;
  /** Build the current document from every registered system. Does not write. */
  capture(): GameSaveDocument;
  /** Write the live state to the active slot now. */
  save(): Promise<void>;
  /** Read the active slot and apply every section to its system. */
  load(): Promise<GameSaveDocument>;
  /** Flush the current slot, switch, and load the next one. */
  switchSlot(slot: string): Promise<GameSaveDocument>;
  /**
   * Read a slot's document without applying it to the live systems — the save-select menu's data
   * source. Returns `null` for an empty slot.
   */
  peek(slot: string): Promise<GameSaveDocument | null>;
  /** Slots this save has written. */
  slots(): Promise<string[]>;
  slot(): string;
  status(): SaveStatus;
  /** Monotonic change counter — bumps on any value or status change. */
  revision(): number;
  /** Capture the live state and mark it dirty; a caller-policy autosave schedules the write. */
  touch(): GameSaveDocument;
  /** One hash over every section, the clock and the RNG cursor — what a determinism test compares. */
  digest(): string;
  /** Per-system section hashes, so a caller can see which systems the digest covers. */
  digests(): Record<string, string>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const type = typeof value;
  if (type === "number") return Number.isFinite(value as number) ? JSON.stringify(value) : "null";
  if (type === "boolean" || type === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (type === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return "null";
}

function digestOf(value: unknown): string {
  return hashString(stableStringify(value)).toString(36);
}

/**
 * A stable hash over the state-bearing part of a document — every system section, the world clock
 * and the shared RNG cursor — excluding the wall-clock `savedAt`, which is not state.
 *
 * @capability game-save-digest hash a save document's state for a determinism test or a diff
 */
export function gameSaveDigest(document: GameSaveDocument): string {
  return digestOf({
    version: document.version,
    game: document.game,
    time: document.time,
    playtime: document.playtime,
    rng: document.rng,
    systems: document.systems,
  });
}

function emptyDocument(config: GameSaveConfig, version: number): GameSaveDocument {
  return {
    version,
    game: config.game,
    savedAt: (config.now ?? Date.now)(),
    time: config.clock?.() ?? 0,
    playtime: config.playtime?.() ?? 0,
    rng: null,
    systems: {},
  };
}

/**
 * Create a {@link GameSave}. Register every stateful system once; `capture()` writes one versioned
 * document with a section per system, `save()`/`touch()` persist it through the injected backend
 * (autosave cadence is the caller's), `load()` restores every section and the shared RNG cursor, and
 * `digest()`/`digests()` give a determinism test a hash over the whole state.
 *
 * @capability game-save one versioned save document with per-system sections, named slots, caller-policy autosave, migration and a state digest
 */
export function createGameSave(config: GameSaveConfig): GameSave {
  const version = config.version ?? GAME_SAVE_VERSION;
  const systems = new Map<string, GameSaveSystem>();

  function add(system: GameSaveSystem): void {
    if (systems.has(system.name)) throw new Error(`game-save: system "${system.name}" is already registered`);
    systems.set(system.name, system);
  }
  for (const system of config.systems ?? []) add(system);

  function capture(): GameSaveDocument {
    const sections: Record<string, unknown> = {};
    for (const [name, system] of systems) sections[name] = system.snapshot();
    return {
      version,
      game: config.game,
      savedAt: (config.now ?? Date.now)(),
      time: config.clock?.() ?? 0,
      playtime: config.playtime?.() ?? 0,
      rng:
        config.rng === undefined
          ? null
          : { seed: config.rng.seed, cursor: rngStateOf(config.rng.stream) },
      systems: sections,
    };
  }

  function apply(document: GameSaveDocument): void {
    const sections = document.systems ?? {};
    for (const [name, system] of systems) {
      if (Object.hasOwn(sections, name)) system.restore(sections[name]);
      else system.reset?.();
    }
    if (config.rng === undefined || document.rng === null) return;
    if (document.rng.seed !== config.rng.seed) {
      config.onError?.(
        new Error(
          `game-save: document was written by world seed "${String(document.rng.seed)}", not "${String(config.rng.seed)}" — RNG cursor not restored`,
        ),
      );
      return;
    }
    if (document.rng.cursor !== null) restoreRng(config.rng.stream, document.rng.cursor);
  }

  const store = createSaveStore<GameSaveDocument>({
    backend: config.backend,
    initial: emptyDocument(config, version),
    key: config.key ?? `game-save:${config.game}`,
    slot: config.slot,
    version,
    autosave: config.autosave,
    now: config.now,
    timers: config.timers,
    onError: config.onError,
    migrate: (data, fromVersion) => {
      if (fromVersion === version) return data as GameSaveDocument;
      if (config.migrate !== undefined) return { ...config.migrate(data, fromVersion), version };
      return { ...(data as GameSaveDocument), version };
    },
  });

  const unregister =
    config.devtoolsName === undefined
      ? null
      : devtools.probes.register(
          config.devtoolsName,
          () => `${store.slot()} ${store.status()} rev ${store.revision()} ${systems.size} systems`,
        );

  return {
    register(system) {
      add(system);
      return () => systems.delete(system.name);
    },
    capture,
    async save() {
      store.set(capture());
      await store.save();
    },
    async load() {
      const document = await store.load();
      apply(document);
      return document;
    },
    async switchSlot(slot) {
      store.set(capture());
      const document = await store.switchSlot(slot);
      apply(document);
      return document;
    },
    async peek(slot) {
      const stored = await store.peek(slot);
      if (stored === null) return null;
      return stored.value;
    },
    slots: () => store.slots(),
    slot: () => store.slot(),
    status: () => store.status(),
    revision: () => store.revision(),
    touch() {
      const document = capture();
      store.set(document);
      return document;
    },
    digest: () => gameSaveDigest(capture()),
    digests() {
      const out: Record<string, string> = {};
      for (const [name, system] of systems) out[name] = digestOf(system.snapshot());
      return out;
    },
    subscribe: (listener) => store.subscribe(listener),
    dispose: () => {
      unregister?.();
      store.dispose();
    },
  };
}
