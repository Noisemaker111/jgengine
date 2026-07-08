export interface LevelDescriptor<TLevelConfig> {
  id: string;
  config: TLevelConfig;
}

export interface LevelSequenceConfig<TLevelConfig> {
  levels: readonly LevelDescriptor<TLevelConfig>[];
  /** Extra attempts granted after the first per level. Defaults to 0 (a single attempt, no retries). */
  retriesPerLevel?: number;
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
  /** Marks the current level cleared; call `advance()` to move to the next one. */
  clear(): void;
  /** Consumes an attempt on the current level. Returns "retry" while attempts remain, else "failed". */
  fail(): "retry" | "failed";
  /** Restarts the current level after a "retry"-eligible failure. Returns false if there was nothing to retry. */
  retry(): boolean;
  /** Moves past a cleared level, or to "complete" if it was the last one. Returns false unless status is "cleared". */
  advance(): boolean;
  reset(): void;
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

  let index = 0;
  let attempt = 1;
  let status: LevelSequenceStatus = "idle";
  const clearedIds: string[] = [];

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
    clear() {
      if (status !== "playing" || current() === null) return;
      clearedIds.push(levels[index]!.id);
      status = "cleared";
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
