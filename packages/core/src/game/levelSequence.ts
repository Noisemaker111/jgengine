import { createKeyValueStore, type KeyValueStorage } from "./keyValueStore";

export interface LevelDescriptor<TLevelConfig> {
  id: string;
  config: TLevelConfig;
}

/** A level's star rating, 0 (cleared, no stars) to 3. */
export type LevelStars = 0 | 1 | 2 | 3;

/** Persisted per-level outcome: whether it has ever been cleared and the best star rating achieved. */
export interface LevelRecord {
  cleared: boolean;
  stars: LevelStars;
}

export interface LevelSequenceConfig<TLevelConfig> {
  levels: readonly LevelDescriptor<TLevelConfig>[];
  /** Extra attempts granted after the first per level. Defaults to 0 (a single attempt, no retries). */
  retriesPerLevel?: number;
  /** Persistence key for per-level completion/stars. Omit to keep records in-memory only. */
  key?: string;
  /** Storage backend for the records (browser `localStorage` by default when `key` is set); pass `null` for memory-only. */
  storage?: KeyValueStorage | null;
}

export type LevelSequenceStatus = "idle" | "playing" | "cleared" | "failed" | "complete";

export interface CurrentLevel<TLevelConfig> {
  id: string;
  index: number;
  config: TLevelConfig;
  attempt: number;
}

export interface LevelSequenceProgress {
  index: number;
  total: number;
  cleared: readonly string[];
}

export interface LevelSequence<TLevelConfig> {
  current(): CurrentLevel<TLevelConfig> | null;
  status(): LevelSequenceStatus;
  /** Enters level 0. A no-op on an empty level list, which leaves `status()` at "idle" forever. */
  start(): void;
  /** Marks the current level cleared, recording its best star rating; call `advance()` to move to the next one. */
  clear(stars?: LevelStars): void;
  /** Consumes an attempt on the current level. Returns "retry" while attempts remain, else "failed". */
  fail(): "retry" | "failed";
  /** Restarts the current level after a "retry"-eligible failure. Returns false if there was nothing to retry. */
  retry(): boolean;
  /** Moves past a cleared level, or to "complete" if it was the last one. Returns false unless status is "cleared". */
  advance(): boolean;
  /** Jumps directly to an unlocked level and starts it. Returns false for an unknown or still-locked level. */
  select(level: string): boolean;
  /** Whether a level can be entered: the first level always, later ones once the preceding level has a cleared record. */
  isUnlocked(level: string): boolean;
  /** The persisted record for a level, or `null` if it has never been cleared. */
  record(level: string): LevelRecord | null;
  /** A snapshot of every persisted level record, keyed by level id. */
  records(): Readonly<Record<string, LevelRecord>>;
  reset(): void;
  /** Wipes all persisted completion/star records (and the frontier), returning to a fresh campaign. */
  clearRecords(): void;
  progress(): LevelSequenceProgress;
}

/**
 * A pure, deterministic level campaign: an ordered list of levels, each with its own opaque config, played
 * through a `start` → (`clear` → `advance`)* → `complete` happy path, with `fail`/`retry` handling per-level
 * attempts. Mirrors the reducer style of `game/race.ts` and `ai/spawnDirector.ts` — no I/O, no timers, just
 * state transitions driven by the caller.
 */
export function createLevelSequence<TLevelConfig>(
  config: LevelSequenceConfig<TLevelConfig>,
): LevelSequence<TLevelConfig> {
  const levels = config.levels;
  const maxAttempts = 1 + Math.max(0, Math.floor(config.retriesPerLevel ?? 0));
  const store =
    config.key === undefined
      ? null
      : createKeyValueStore<Record<string, LevelRecord>>({
          key: config.key,
          initial: {},
          storage: config.storage,
        });

  let index = 0;
  let attempt = 1;
  let status: LevelSequenceStatus = "idle";
  const clearedIds: string[] = [];
  const levelRecords: Record<string, LevelRecord> = store === null ? {} : { ...store.get() };

  function persistRecords(): void {
    store?.set({ ...levelRecords });
  }

  function indexOfLevel(id: string): number {
    return levels.findIndex((level) => level.id === id);
  }

  function isUnlocked(id: string): boolean {
    const idx = indexOfLevel(id);
    if (idx < 0) return false;
    if (idx === 0) return true;
    return levelRecords[levels[idx - 1]!.id]?.cleared === true;
  }

  function current(): CurrentLevel<TLevelConfig> | null {
    if (status === "idle" || status === "complete") return null;
    const level = levels[index];
    if (level === undefined) return null;
    return { id: level.id, index, config: level.config, attempt };
  }

  return {
    current,
    status: () => status,
    start() {
      if (levels.length === 0) return;
      index = 0;
      attempt = 1;
      clearedIds.length = 0;
      status = "playing";
    },
    clear(stars?: LevelStars) {
      if (status !== "playing" || current() === null) return;
      const id = levels[index]!.id;
      clearedIds.push(id);
      const previousStars = levelRecords[id]?.stars ?? 0;
      const bestStars = Math.max(previousStars, stars ?? 0) as LevelStars;
      levelRecords[id] = { cleared: true, stars: bestStars };
      persistRecords();
      status = "cleared";
    },
    select(level: string) {
      const idx = indexOfLevel(level);
      if (idx < 0 || !isUnlocked(level)) return false;
      index = idx;
      attempt = 1;
      status = "playing";
      return true;
    },
    isUnlocked,
    record: (level: string) => levelRecords[level] ?? null,
    records: () => ({ ...levelRecords }),
    clearRecords() {
      for (const id of Object.keys(levelRecords)) delete levelRecords[id];
      store?.clear();
      index = 0;
      attempt = 1;
      clearedIds.length = 0;
      status = "idle";
    },
    fail() {
      if (status !== "playing" || current() === null) return "failed";
      status = "failed";
      return attempt < maxAttempts ? "retry" : "failed";
    },
    retry() {
      if (status !== "failed" || attempt >= maxAttempts) return false;
      attempt += 1;
      status = "playing";
      return true;
    },
    advance() {
      if (status !== "cleared") return false;
      if (index >= levels.length - 1) {
        status = "complete";
        return true;
      }
      index += 1;
      attempt = 1;
      status = "playing";
      return true;
    },
    reset() {
      index = 0;
      attempt = 1;
      clearedIds.length = 0;
      status = "idle";
    },
    progress() {
      return {
        index: status === "complete" ? levels.length : index,
        total: levels.length,
        cleared: [...clearedIds],
      };
    },
  };
}
