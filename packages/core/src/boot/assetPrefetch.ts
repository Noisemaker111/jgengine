import { resolveAssetBaseUrl } from "@jgengine/core/assets/assetBase";
import { orderPrefetch, type PrefetchItem, type PrefetchTier } from "@jgengine/core/boot/prefetchTier";

/** How far a prefetch got, in files. */
export interface PrefetchState {
  total: number;
  done: number;
  failed: number;
  nearTotal: number;
  nearDone: number;
}

const EMPTY: PrefetchState = { total: 0, done: 0, failed: 0, nearTotal: 0, nearDone: 0 };

/** Downloads a game's files in the background, near ones first, so a later load reads them from the browser cache. */
export interface AssetPrefetch {
  /** Fetch these files, near tier first; a new call replaces the list and keeps what already finished. */
  start: (items: readonly PrefetchItem[]) => void;
  state: () => PrefetchState;
  /** Every near file has been fetched (or failed, which a later load reports itself). */
  nearReady: () => boolean;
  subscribe: (listener: () => void) => () => void;
  snapshot: () => PrefetchState;
  /** Stop fetching and forget the list. */
  reset: () => void;
}

/**
 * A background downloader for a game's files. `fetchFile` reads one URL to the end (so the browser
 * caches it); `resolve` maps a game path to the URL it loads from.
 * @internal
 */
export function createAssetPrefetch(options: {
  fetchFile?: (url: string, tier: PrefetchTier) => Promise<boolean>;
  resolve?: (path: string) => string;
  concurrency?: number;
} = {}): AssetPrefetch {
  const fetchFile = options.fetchFile ?? defaultFetchFile;
  const resolve = options.resolve ?? resolveAssetBaseUrl;
  const concurrency = Math.max(1, options.concurrency ?? 6);
  const listeners = new Set<() => void>();
  const finished = new Map<string, boolean>();
  let queue: PrefetchItem[] = [];
  let list: PrefetchItem[] = [];
  let state = EMPTY;
  let running = 0;
  let generation = 0;
  const publish = (): void => {
    const near = list.filter((item) => item.tier === "near");
    state = {
      total: list.length,
      done: list.filter((item) => finished.has(item.path)).length,
      failed: list.filter((item) => finished.get(item.path) === false).length,
      nearTotal: near.length,
      nearDone: near.filter((item) => finished.has(item.path)).length,
    };
    for (const listener of listeners) listener();
  };
  const pump = (): void => {
    const run = generation;
    while (running < concurrency) {
      const item = queue.shift();
      if (item === undefined) return;
      if (finished.has(item.path)) continue;
      running += 1;
      void fetchFile(resolve(item.path), item.tier)
        .catch(() => false)
        .then((ok) => {
          if (run !== generation) return;
          running -= 1;
          finished.set(item.path, ok);
          publish();
          pump();
        });
    }
  };
  return {
    start(items) {
      list = orderPrefetch(items);
      queue = list.filter((item) => !finished.has(item.path));
      publish();
      pump();
    },
    state: () => state,
    nearReady: () => state.nearDone >= state.nearTotal,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => ({ ...state }),
    reset() {
      generation += 1;
      running = 0;
      queue = [];
      list = [];
      finished.clear();
      publish();
    },
  };
}

async function defaultFetchFile(url: string, tier: PrefetchTier): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  const response = await fetch(url, { priority: tier === "near" ? "auto" : "low" });
  await response.arrayBuffer();
  return response.ok;
}

/** The page's prefetch: one game per page, started when the game opens. */
export const pagePrefetch: AssetPrefetch = createAssetPrefetch();
