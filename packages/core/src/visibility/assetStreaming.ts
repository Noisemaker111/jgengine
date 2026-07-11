import type { StreamingSettings } from "./settings";
import { DEFAULT_STREAMING_SETTINGS, mergeStreamingSettings } from "./settings";
import type { VisibilityStats } from "./diagnostics";
import { nowMs } from "./diagnostics";

export type AssetLoadState = "queued" | "loading" | "loaded" | "unloaded" | "error";

export interface AssetLoadResult {
  /** Approximate resident size, used for the memory budget and small-asset resident policy. */
  readonly bytes?: number;
  /** Opaque handle to the loaded resource (texture, mesh, buffer). */
  readonly value?: unknown;
}

export interface CancelSignal {
  readonly cancelled: boolean;
}

export interface AssetStreamingOptions {
  /** Async loader. Must honor `signal.cancelled` and avoid committing work when it flips true. */
  readonly load: (assetId: string, signal: CancelSignal) => Promise<AssetLoadResult>;
  /** Release GPU/CPU resources for an asset. */
  readonly unload?: (assetId: string) => void;
  readonly settings?: Partial<StreamingSettings>;
  readonly now?: () => number;
}

export interface AssetRecord {
  readonly id: string;
  state: AssetLoadState;
  bytes: number;
  priority: number;
  refCount: number;
  pinned: boolean;
  lastActiveMs: number;
  value: unknown;
}

export interface StreamingStats {
  queued: number;
  loading: number;
  loaded: number;
  unloaded: number;
  errored: number;
  inFlight: number;
  cancelled: number;
  bytes: number;
}

export interface AssetStreamingSystem {
  /** Demand an asset (near/in view). Deduplicated — an already loaded/loading/queued asset is never re-fetched concurrently. */
  request(assetId: string, priority?: number): void;
  /** Shared ownership by an active object. A retained asset (refCount > 0) is never auto-unloaded. */
  retain(assetId: string): void;
  release(assetId: string): void;
  /** Pin resident regardless of distance/refcount/scene. */
  pin(assetId: string): void;
  unpin(assetId: string): void;
  /** Refresh the "last needed" timestamp used by the grace-period unload. */
  markActive(assetId: string): void;
  /** Advance one frame: start up to the load budget, evict past-grace assets up to the unload budget. */
  tick(dt: number): void;
  /** Cancel an in-flight or queued request that is no longer needed. */
  cancel(assetId: string): void;
  stateOf(assetId: string): AssetLoadState | undefined;
  isLoaded(assetId: string): boolean;
  record(assetId: string): AssetRecord | undefined;
  stats(): StreamingStats;
  /** Merge asset counters into a per-frame VisibilityStats. */
  applyTo(stats: VisibilityStats): void;
  /** Resolve once every in-flight load settles — for deterministic tests. */
  settle(): Promise<void>;
  clear(): void;
}

export function createAssetStreamingSystem(options: AssetStreamingOptions): AssetStreamingSystem {
  const settings: StreamingSettings = mergeStreamingSettings(DEFAULT_STREAMING_SETTINGS, options.settings ?? {});
  const clock = options.now ?? nowMs;
  const records = new Map<string, AssetRecord>();
  const queued = new Set<string>();
  const signals = new Map<string, { cancelled: boolean }>();
  const inFlight = new Set<Promise<void>>();
  let unloadedTotal = 0;
  let cancelledTotal = 0;

  function ensure(id: string): AssetRecord {
    let record = records.get(id);
    if (record === undefined) {
      record = { id, state: "unloaded", bytes: 0, priority: 0, refCount: 0, pinned: false, lastActiveMs: clock(), value: undefined };
      records.set(id, record);
    }
    return record;
  }

  function enqueue(record: AssetRecord, priority: number): void {
    if (record.state === "loaded" || record.state === "loading") {
      record.priority = Math.max(record.priority, priority);
      return;
    }
    record.state = "queued";
    record.priority = Math.max(record.priority, priority);
    queued.add(record.id);
  }

  function startLoad(record: AssetRecord): void {
    queued.delete(record.id);
    record.state = "loading";
    const signal = { cancelled: false };
    signals.set(record.id, signal);
    const promise = options
      .load(record.id, signal)
      .then((result) => {
        signals.delete(record.id);
        if (signal.cancelled || !records.has(record.id)) {
          record.state = "unloaded";
          return;
        }
        record.state = "loaded";
        record.bytes = result.bytes ?? 0;
        record.value = result.value;
        record.lastActiveMs = clock();
      })
      .catch(() => {
        signals.delete(record.id);
        if (!signal.cancelled) record.state = "error";
      })
      .finally(() => {
        inFlight.delete(promise);
      });
    inFlight.add(promise);
  }

  function evictable(record: AssetRecord, now: number): boolean {
    if (record.state !== "loaded") return false;
    if (record.pinned || record.refCount > 0) return false;
    if (record.bytes > 0 && record.bytes <= settings.keepResidentBytes) return false;
    return now - record.lastActiveMs >= settings.unloadGraceSeconds * 1000;
  }

  return {
    request(assetId, priority = 0) {
      const record = ensure(assetId);
      record.lastActiveMs = clock();
      enqueue(record, priority);
    },
    retain(assetId) {
      ensure(assetId).refCount += 1;
    },
    release(assetId) {
      const record = records.get(assetId);
      if (record !== undefined && record.refCount > 0) record.refCount -= 1;
    },
    pin(assetId) {
      ensure(assetId).pinned = true;
    },
    unpin(assetId) {
      const record = records.get(assetId);
      if (record !== undefined) record.pinned = false;
    },
    markActive(assetId) {
      const record = records.get(assetId);
      if (record !== undefined) record.lastActiveMs = clock();
    },
    tick() {
      const now = clock();
      if (queued.size > 0) {
        const pending: AssetRecord[] = [];
        for (const id of queued) {
          const record = records.get(id);
          if (record !== undefined) pending.push(record);
        }
        pending.sort((a, b) => b.priority - a.priority);
        const budget = Math.min(settings.maxLoadsPerFrame, pending.length);
        for (let i = 0; i < budget; i += 1) startLoad(pending[i]!);
      }
      let unloads = 0;
      for (const record of records.values()) {
        if (unloads >= settings.maxUnloadsPerFrame) break;
        if (!evictable(record, now)) continue;
        options.unload?.(record.id);
        record.state = "unloaded";
        record.bytes = 0;
        record.value = undefined;
        unloadedTotal += 1;
        unloads += 1;
      }
    },
    cancel(assetId) {
      if (queued.delete(assetId)) {
        const record = records.get(assetId);
        if (record !== undefined) record.state = "unloaded";
        cancelledTotal += 1;
        return;
      }
      const signal = signals.get(assetId);
      if (signal !== undefined) {
        signal.cancelled = true;
        const record = records.get(assetId);
        if (record !== undefined) record.state = "unloaded";
        cancelledTotal += 1;
      }
    },
    stateOf(assetId) {
      return records.get(assetId)?.state;
    },
    isLoaded(assetId) {
      return records.get(assetId)?.state === "loaded";
    },
    record(assetId) {
      return records.get(assetId);
    },
    stats() {
      let queuedCount = 0, loading = 0, loaded = 0, errored = 0, bytes = 0;
      for (const record of records.values()) {
        switch (record.state) {
          case "queued": queuedCount += 1; break;
          case "loading": loading += 1; break;
          case "loaded": loaded += 1; bytes += record.bytes; break;
          case "error": errored += 1; break;
        }
      }
      return {
        queued: queuedCount,
        loading,
        loaded,
        unloaded: unloadedTotal,
        errored,
        inFlight: inFlight.size,
        cancelled: cancelledTotal,
        bytes,
      };
    },
    applyTo(stats) {
      const s = this.stats();
      stats.assetsQueued = s.queued;
      stats.assetsLoading = s.loading;
      stats.assetsLoaded = s.loaded;
      stats.assetsUnloaded = s.unloaded;
      stats.streamedBytes = s.bytes;
    },
    async settle() {
      while (inFlight.size > 0) {
        await Promise.all(Array.from(inFlight));
      }
    },
    clear() {
      for (const signal of signals.values()) signal.cancelled = true;
      records.clear();
      queued.clear();
      signals.clear();
      inFlight.clear();
      unloadedTotal = 0;
      cancelledTotal = 0;
    },
  };
}
