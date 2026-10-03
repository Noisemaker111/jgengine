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
  /** Async loader. Honor `signal.cancelled` and always settle; cancelled successful loads are released through `unload`. */
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

/** Current demand/residency gauges and cumulative unload/cancellation counters; clear resets totals. */
export interface StreamingStats {
  queued: number;
  loading: number;
  loaded: number;
  unloaded: number;
  errored: number;
  inFlight: number;
  cancelled: number;
  /** Known resident bytes; missing or invalid loader sizes count as zero. */
  bytes: number;
  /** Current tracked records, including inactive history until forget or clear. */
  records: number;
  /** Known bytes protected by pins or active references. */
  protectedBytes: number;
  /** Loaded assets whose resident size is unknown. */
  unknownSizeLoaded: number;
  /** Known resident bytes above the configured target, including protected bytes. */
  overBudgetBytes: number;
  /** Cumulative resources evicted by resident-byte pressure since clear. */
  budgetEvicted: number;
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
  /** Advance one frame: bounded load starts and unloads; resident-byte pressure precedes idle unloading. */
  tick(dt: number): void;
  /** Cancel demand. Unresolved loads still occupy concurrency slots and block same-id retries until settlement. */
  cancel(assetId: string): void;
  /** Merge policy. Zero concurrency pauses starts; resident-byte target/order changes apply on the next tick. */
  retune(settings: Partial<StreamingSettings>): void;
  stateOf(assetId: string): AssetLoadState | undefined;
  isLoaded(assetId: string): boolean;
  record(assetId: string): AssetRecord | undefined;
  /** Drop inactive unloaded/error history. Returns false for missing, pinned, retained, queued, loaded or unresolved assets. Old record handles remain detached; future demand creates a new record. */
  forget(assetId: string): boolean;
  stats(): StreamingStats;
  /** Merge asset counters into a per-frame VisibilityStats. */
  applyTo(stats: VisibilityStats): void;
  /** Resolve once every in-flight load settles — for deterministic tests. */
  settle(): Promise<void>;
  /** Release loaded resources and cancel demand; outstanding loads remain tracked until settlement. */
  clear(): void;
}

/** Stream shared resources with bounded load concurrency, per-tick resident-byte eviction, and explicit inactive-history cleanup. */
export function createAssetStreamingSystem(options: AssetStreamingOptions): AssetStreamingSystem {
  function mergeSettings(base: StreamingSettings, patch: Partial<StreamingSettings>): StreamingSettings {
    const next = mergeStreamingSettings(base, patch);
    if (!Number.isSafeInteger(next.maxConcurrentLoads) || next.maxConcurrentLoads < 0) {
      throw new RangeError("AssetStreamingSystem: maxConcurrentLoads must be a nonnegative safe integer");
    }
    if (next.maxResidentBytes !== Infinity && (!Number.isFinite(next.maxResidentBytes) || next.maxResidentBytes < 0)) {
      throw new RangeError("AssetStreamingSystem: maxResidentBytes must be nonnegative and finite, or Infinity");
    }
    if (next.residentEvictionOrder !== "oldest" && next.residentEvictionOrder !== "largest") {
      throw new RangeError("AssetStreamingSystem: residentEvictionOrder must be oldest or largest");
    }
    return next;
  }

  let settings = mergeSettings(DEFAULT_STREAMING_SETTINGS, options.settings ?? {});
  const clock = options.now ?? nowMs;
  const records = new Map<string, AssetRecord>();
  const queued = new Set<string>();
  const residents = new Set<AssetRecord>();
  const unknownSizes = new Set<AssetRecord>();
  const signals = new Map<string, { cancelled: boolean }>();
  const inFlight = new Set<Promise<void>>();
  let unloadedTotal = 0;
  let cancelledTotal = 0;
  let budgetEvictedTotal = 0;

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
    let loading: Promise<AssetLoadResult>;
    try {
      loading = options.load(record.id, signal);
    } catch (error) {
      loading = Promise.reject(error);
    }
    const promise = loading
      .then((result) => {
        if (signal.cancelled || records.get(record.id) !== record) {
          options.unload?.(record.id);
          return;
        }
        record.state = "loaded";
        const knownSize = typeof result.bytes === "number" && Number.isFinite(result.bytes) && result.bytes >= 0;
        record.bytes = knownSize ? result.bytes! : 0;
        if (!knownSize) unknownSizes.add(record);
        record.value = result.value;
        record.lastActiveMs = clock();
        residents.add(record);
      })
      .catch(() => {
        if (!signal.cancelled && records.get(record.id) === record) record.state = "error";
      })
      .finally(() => {
        if (signals.get(record.id) === signal) signals.delete(record.id);
        inFlight.delete(promise);
      });
    inFlight.add(promise);
  }

  function unprotected(record: AssetRecord): boolean {
    return record.state === "loaded" && !record.pinned && record.refCount === 0;
  }

  function compareEviction(a: AssetRecord, b: AssetRecord): number {
    if (settings.residentEvictionOrder === "largest" && a.bytes !== b.bytes) return b.bytes - a.bytes;
    return a.lastActiveMs - b.lastActiveMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  function unload(record: AssetRecord): void {
    options.unload?.(record.id);
    residents.delete(record);
    unknownSizes.delete(record);
    record.state = "unloaded";
    record.bytes = 0;
    record.value = undefined;
    unloadedTotal += 1;
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
      if (queued.size > 0 && signals.size < settings.maxConcurrentLoads) {
        const pending: AssetRecord[] = [];
        for (const id of queued) {
          const record = records.get(id);
          if (record !== undefined && !signals.has(id)) pending.push(record);
        }
        pending.sort((a, b) => b.priority - a.priority);
        const budget = Math.min(settings.maxLoadsPerFrame, settings.maxConcurrentLoads - signals.size, pending.length);
        for (let i = 0; i < budget && signals.size < settings.maxConcurrentLoads; i += 1) {
          const record = pending[i]!;
          if (queued.has(record.id) && records.get(record.id) === record && !signals.has(record.id)) startLoad(record);
        }
      }
      let bytes = 0;
      for (const record of residents) bytes += record.bytes;
      let unloads = 0;
      while (bytes > settings.maxResidentBytes && unloads < settings.maxUnloadsPerFrame) {
        let candidate: AssetRecord | undefined;
        for (const record of residents) {
          if (record.bytes > 0 && unprotected(record) && (candidate === undefined || compareEviction(record, candidate) < 0)) candidate = record;
        }
        if (candidate === undefined) break;
        const releasedBytes = candidate.bytes;
        unload(candidate);
        bytes -= releasedBytes;
        budgetEvictedTotal += 1;
        unloads += 1;
      }
      for (const record of residents) {
        if (unloads >= settings.maxUnloadsPerFrame) break;
        if (!evictable(record, now)) continue;
        unload(record);
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
      if (signal !== undefined && !signal.cancelled) {
        signal.cancelled = true;
        const record = records.get(assetId);
        if (record !== undefined) record.state = "unloaded";
        cancelledTotal += 1;
      }
    },
    retune(patch) {
      settings = mergeSettings(settings, patch);
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
    forget(assetId) {
      const record = records.get(assetId);
      if (record === undefined || record.pinned || record.refCount > 0 || signals.has(assetId) || queued.has(assetId)) return false;
      if (record.state !== "unloaded" && record.state !== "error") return false;
      return records.delete(assetId);
    },
    stats() {
      let queuedCount = 0, loading = 0, loaded = 0, errored = 0, bytes = 0, protectedBytes = 0, unknownSizeLoaded = 0;
      for (const record of records.values()) {
        switch (record.state) {
          case "queued": queuedCount += 1; break;
          case "loading": loading += 1; break;
          case "loaded":
            loaded += 1;
            bytes += record.bytes;
            if (record.pinned || record.refCount > 0) protectedBytes += record.bytes;
            if (unknownSizes.has(record)) unknownSizeLoaded += 1;
            break;
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
        records: records.size,
        protectedBytes,
        unknownSizeLoaded,
        overBudgetBytes: Math.max(0, bytes - settings.maxResidentBytes),
        budgetEvicted: budgetEvictedTotal,
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
      const loaded = [...records.values()].filter((record) => record.state === "loaded").map((record) => record.id);
      records.clear();
      queued.clear();
      residents.clear();
      unknownSizes.clear();
      budgetEvictedTotal = 0;
      unloadedTotal = 0;
      cancelledTotal = 0;
      for (const id of loaded) options.unload?.(id);
    },
  };
}
