/** A sampled pair of snapshots and interpolation factor. */
export type SnapshotBufferSample<T> = {
  before: T;
  after: T;
  alpha: number;
};

/** Serializable snapshot-buffer state. */
export type SnapshotBufferState<T> = {
  delayMs: number;
  capacity: number;
  entries: Array<{ atMs: number; value: T }>;
};

/** Handle for a timestamped delayed snapshot buffer. */
export type SnapshotBuffer<T> = {
  push(atMs: number, value: T): void;
  sampleAt(nowMs: number): SnapshotBufferSample<T> | null;
  snapshot(): SnapshotBufferState<T>;
  restore(next: SnapshotBufferState<T>): void;
  retune(config: { delayMs?: number; capacity?: number }): void;
};

/** Stores timestamped snapshots and samples a delayed, interpolatable pair.
 * @capability runtime snapshot interpolation
 */
export function createSnapshotBuffer<T>(config: {
  delayMs: number;
  capacity: number;
}): SnapshotBuffer<T> {
  let delayMs = Math.max(0, config.delayMs);
  let capacity = Math.max(1, Math.floor(config.capacity));
  let entries: Array<{ atMs: number; value: T }> = [];

  const trim = () => {
    if (entries.length > capacity) entries = entries.slice(-capacity);
  };

  return {
    push(atMs, value) {
      const entry = { atMs, value };
      const index = entries.findIndex((item) => item.atMs > atMs);
      if (index < 0) entries.push(entry);
      else entries.splice(index, 0, entry);
      trim();
    },
    sampleAt(nowMs) {
      if (entries.length === 0) return null;
      const target = nowMs - delayMs;
      if (target <= entries[0].atMs) return { before: entries[0].value, after: entries[0].value, alpha: 0 };
      const last = entries[entries.length - 1];
      if (target >= last.atMs) return { before: last.value, after: last.value, alpha: 1 };
      for (let i = 1; i < entries.length; i += 1) {
        const after = entries[i];
        if (target <= after.atMs) {
          const before = entries[i - 1];
          const span = after.atMs - before.atMs;
          return { before: before.value, after: after.value, alpha: span === 0 ? 1 : (target - before.atMs) / span };
        }
      }
      return null;
    },
    snapshot() {
      return { delayMs, capacity, entries: entries.map((entry) => ({ ...entry })) };
    },
    restore(next) {
      delayMs = Math.max(0, next.delayMs);
      capacity = Math.max(1, Math.floor(next.capacity));
      entries = next.entries.map((entry) => ({ ...entry })).sort((a, b) => a.atMs - b.atMs);
      trim();
    },
    retune(config) {
      if (config.delayMs !== undefined) delayMs = Math.max(0, config.delayMs);
      if (config.capacity !== undefined) capacity = Math.max(1, Math.floor(config.capacity));
      trim();
    },
  };
}
