/**
 * The proximity streamer for a world split into shards or grid cells: a stateful scheduler that
 * decides, as one or more focus points move, which shards enter and leave residency. It is pure
 * scheduling: reading a shard's content stays the caller's job, so the streamer has no I/O and stays
 * deterministic. Hysteresis (`loadRadius` < `keepRadius`) stops a shard on a boundary from thrashing,
 * per-update budgets spread a burst of loads and unloads over several updates, and a shard whose
 * content arrives later stays `loading` until the caller marks it ready.
 */

/** The minimal shard shape the streamer schedules on: any world-manifest shard or grid cell satisfies it. */
export interface StreamerShard {
  /** Stable shard id (the load/unload unit). */
  id: string;
  /** XZ footprint `[minX, minZ]`..`[maxX, maxZ]`; absent = always resident. */
  bounds?: { min: readonly [number, number]; max: readonly [number, number] };
  /** `"always"` keeps the shard resident regardless of distance; default `"streamed"` when bounded. */
  residency?: "always" | "streamed";
}

/** A point residency is measured from: a camera, or one player in a shared world. */
export interface StreamFocus {
  x: number;
  z: number;
}

/** Play-time tuning of a {@link WorldStreamer}; every field is retunable. */
export interface WorldStreamerTuning {
  /** Load a shard when a focus comes within this distance (m) of its footprint. */
  loadRadius: number;
  /** Keep a loaded shard resident until every focus is farther than this (m), the hysteresis band. Clamped up to `loadRadius`. */
  keepRadius: number;
  /** Most shards that start loading in one update, nearest first; the rest wait for the next. Default unlimited. */
  loadsPerUpdate?: number;
  /** Most shards that unload in one update, farthest first. Default unlimited. */
  unloadsPerUpdate?: number;
}

/** Configuration for {@link createWorldStreamer}. */
export interface WorldStreamerConfig extends WorldStreamerTuning {
  shards: readonly StreamerShard[];
  /**
   * When true a loaded shard stays `loading` until {@link WorldStreamer.markReady}, so a caller
   * fetching its content asynchronously can keep a stand-in drawn until it arrives. Default false:
   * a shard is ready the update it loads.
   */
  awaitReady?: boolean;
  /** Edge (m) of the index buckets an update reads. Default `max(loadRadius, 32)`. */
  bucketSize?: number;
}

/** Where one shard stands. */
export type ShardResidency = "unloaded" | "loading" | "ready";

/** The residency change produced by one {@link WorldStreamer.update}. */
export interface StreamUpdate {
  /** Shard ids that became resident on this update, nearest first. */
  load: string[];
  /** Shard ids that left residency on this update, farthest first. */
  unload: string[];
  /** Shards that want to load or unload but wait for a later update's budget. */
  pending: number;
}

/** Plain JSON state of a {@link WorldStreamer}: each resident shard and whether it is ready, plus the tuning. */
export interface WorldStreamerState {
  resident: [id: string, state: "loading" | "ready"][];
  tuning: Required<WorldStreamerTuning>;
}

/** A stateful proximity streamer over a fixed shard set. */
export interface WorldStreamer {
  /** Advances to new focus points, returning the residency delta. With no focus point nothing changes. */
  update(focus: StreamFocus | readonly StreamFocus[]): StreamUpdate;
  /** The current resident shard-id set (sorted). */
  resident(): string[];
  /** Where one shard stands; `"unloaded"` for an unknown id. */
  state(id: string): ShardResidency;
  /** Mark a loading shard's content arrived. Returns false when the shard is not loading. */
  markReady(id: string): boolean;
  /** The shard a world point falls in, or null outside every bounded shard. */
  shardAt(x: number, z: number): StreamerShard | null;
  retune(patch: Partial<WorldStreamerTuning>): void;
  tuning(): Required<WorldStreamerTuning>;
  snapshot(): WorldStreamerState;
  restore(state: WorldStreamerState): void;
  /** Clears all residency (next update reloads from scratch). */
  reset(): void;
}

function isAlwaysResident(shard: StreamerShard): boolean {
  return shard.residency === "always" || shard.bounds === undefined;
}

/**
 * Distance from a point to a shard's XZ footprint (0 when inside), or 0 for an always-resident shard.
 * @capability world-streaming distance from a camera to a shard footprint
 */
export function shardDistance(shard: StreamerShard, center: StreamFocus): number {
  if (shard.bounds === undefined) return 0;
  const { min, max } = shard.bounds;
  const qx = Math.max(min[0], Math.min(center.x, max[0]));
  const qz = Math.max(min[1], Math.min(center.z, max[1]));
  return Math.hypot(center.x - qx, center.z - qz);
}

/** One square grid cell: a shard that always has bounds. */
export interface StreamCell extends StreamerShard {
  bounds: { min: readonly [number, number]; max: readonly [number, number] };
}

/** Options for {@link gridShards}. */
export interface GridShardsOptions {
  /** World XZ corner the grid starts from. */
  min: readonly [number, number];
  /** World XZ corner the grid reaches; the last row and column cover it. */
  max: readonly [number, number];
  /** Cell edge in metres. */
  cellSize: number;
}

/**
 * The id of the grid cell a world point falls in: `"col,row"` counted from world origin.
 * @capability world-streaming-cell-id name the streamed grid cell a world point falls in
 */
export function gridCellId(x: number, z: number, cellSize: number): string {
  return `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
}

/**
 * Square cells covering an XZ area, aligned to world origin so the same cell size gives the same ids
 * in every game system (streaming, nav tiles, batching). Ids come from {@link gridCellId}.
 * @capability world-streaming-grid split a world area into streamable grid cells
 */
export function gridShards(options: GridShardsOptions): StreamCell[] {
  const size = options.cellSize;
  if (!(size > 0) || !Number.isFinite(size)) throw new RangeError("gridShards: cellSize must be positive and finite");
  const c0 = Math.floor(options.min[0] / size);
  const r0 = Math.floor(options.min[1] / size);
  const c1 = Math.ceil(options.max[0] / size) - 1;
  const r1 = Math.ceil(options.max[1] / size) - 1;
  const shards: StreamCell[] = [];
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      shards.push({ id: `${col},${row}`, bounds: { min: [col * size, row * size], max: [(col + 1) * size, (row + 1) * size] } });
    }
  }
  return shards;
}

/** The budget an unlimited setting stores, so a snapshot stays plain JSON. */
const UNLIMITED = Number.MAX_SAFE_INTEGER;

function cleanTuning(patch: Partial<WorldStreamerTuning>, base: Required<WorldStreamerTuning>): Required<WorldStreamerTuning> {
  const loadRadius = Math.max(0, patch.loadRadius ?? base.loadRadius);
  const keepRadius = Math.max(loadRadius, patch.keepRadius ?? base.keepRadius);
  const budget = (value: number | undefined, fallback: number) => {
    const next = value ?? fallback;
    return Number.isNaN(next) ? fallback : Math.max(1, Math.floor(Math.min(next, UNLIMITED)));
  };
  return {
    loadRadius,
    keepRadius,
    loadsPerUpdate: budget(patch.loadsPerUpdate, base.loadsPerUpdate),
    unloadsPerUpdate: budget(patch.unloadsPerUpdate, base.unloadsPerUpdate),
  };
}

/**
 * Creates a proximity streamer over a world's shards. Always-resident shards are resident from the
 * first update onward; each bounded shard loads when any focus comes within `loadRadius` of its
 * footprint and unloads only once every focus is past `keepRadius`. An update reads only the index
 * buckets near each focus plus the resident set, never the whole world, and starts at most
 * `loadsPerUpdate` loads and `unloadsPerUpdate` unloads.
 * @capability world-streaming schedule shard load/unload by camera proximity
 */
export function createWorldStreamer(config: WorldStreamerConfig): WorldStreamer {
  let tuning = cleanTuning(config, { loadRadius: 0, keepRadius: 0, loadsPerUpdate: UNLIMITED, unloadsPerUpdate: UNLIMITED });
  const awaitReady = config.awaitReady === true;
  const shards = new Map<string, StreamerShard>();
  const always: StreamerShard[] = [];
  const bucketSize = Math.max(1, config.bucketSize ?? Math.max(tuning.loadRadius, 32));
  const buckets = new Map<string, StreamerShard[]>();
  for (const shard of config.shards) {
    if (shards.has(shard.id)) throw new Error(`createWorldStreamer: duplicate shard id "${shard.id}"`);
    shards.set(shard.id, shard);
    if (shard.bounds === undefined || isAlwaysResident(shard)) {
      always.push(shard);
      continue;
    }
    const { min, max } = shard.bounds;
    for (let bz = Math.floor(min[1] / bucketSize); bz <= Math.floor(max[1] / bucketSize); bz += 1) {
      for (let bx = Math.floor(min[0] / bucketSize); bx <= Math.floor(max[0] / bucketSize); bx += 1) {
        const key = `${bx},${bz}`;
        const list = buckets.get(key);
        if (list === undefined) buckets.set(key, [shard]);
        else list.push(shard);
      }
    }
  }
  const resident = new Map<string, "loading" | "ready">();
  const loadOrder: { id: string; distance: number }[] = [];
  const unloadOrder: { id: string; distance: number }[] = [];
  const seen = new Set<string>();

  const nearest = (shard: StreamerShard, focus: readonly StreamFocus[]): number => {
    let best = Infinity;
    for (const point of focus) best = Math.min(best, shardDistance(shard, point));
    return best;
  };

  return {
    update(input) {
      const focus: readonly StreamFocus[] = "x" in input ? [input] : input;
      const load: string[] = [];
      const unload: string[] = [];
      for (const shard of always) {
        if (!resident.has(shard.id)) {
          resident.set(shard.id, awaitReady ? "loading" : "ready");
          load.push(shard.id);
        }
      }
      if (focus.length === 0) return { load, unload, pending: 0 };
      loadOrder.length = 0;
      unloadOrder.length = 0;
      seen.clear();
      const reach = tuning.loadRadius;
      for (const point of focus) {
        for (let bz = Math.floor((point.z - reach) / bucketSize); bz <= Math.floor((point.z + reach) / bucketSize); bz += 1) {
          for (let bx = Math.floor((point.x - reach) / bucketSize); bx <= Math.floor((point.x + reach) / bucketSize); bx += 1) {
            for (const shard of buckets.get(`${bx},${bz}`) ?? []) {
              if (seen.has(shard.id) || resident.has(shard.id)) continue;
              seen.add(shard.id);
              const distance = nearest(shard, focus);
              if (distance <= tuning.loadRadius) loadOrder.push({ id: shard.id, distance });
            }
          }
        }
      }
      for (const id of resident.keys()) {
        const shard = shards.get(id);
        if (shard === undefined || isAlwaysResident(shard)) continue;
        const distance = nearest(shard, focus);
        if (distance > tuning.keepRadius) unloadOrder.push({ id, distance });
      }
      loadOrder.sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1));
      unloadOrder.sort((a, b) => b.distance - a.distance || (a.id < b.id ? -1 : 1));
      const loads = Math.min(loadOrder.length, tuning.loadsPerUpdate);
      const unloads = Math.min(unloadOrder.length, tuning.unloadsPerUpdate);
      for (const { id } of unloadOrder.slice(0, unloads)) {
        resident.delete(id);
        unload.push(id);
      }
      for (const { id } of loadOrder.slice(0, loads)) {
        resident.set(id, awaitReady ? "loading" : "ready");
        load.push(id);
      }
      return { load, unload, pending: loadOrder.length - loads + unloadOrder.length - unloads };
    },
    resident: () => [...resident.keys()].sort(),
    state: (id) => resident.get(id) ?? "unloaded",
    markReady(id) {
      if (resident.get(id) !== "loading") return false;
      resident.set(id, "ready");
      return true;
    },
    shardAt(x, z) {
      for (const shard of buckets.get(`${Math.floor(x / bucketSize)},${Math.floor(z / bucketSize)}`) ?? []) {
        const bounds = shard.bounds;
        if (bounds !== undefined && x >= bounds.min[0] && x < bounds.max[0] && z >= bounds.min[1] && z < bounds.max[1]) return shard;
      }
      return null;
    },
    retune(patch) {
      tuning = cleanTuning(patch, tuning);
    },
    tuning: () => ({ ...tuning }),
    snapshot: () => ({ resident: [...resident.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)), tuning: { ...tuning } }),
    restore(state) {
      resident.clear();
      for (const [id, value] of state.resident) if (shards.has(id)) resident.set(id, value);
      tuning = cleanTuning(state.tuning, tuning);
    },
    reset() {
      resident.clear();
    },
  };
}
