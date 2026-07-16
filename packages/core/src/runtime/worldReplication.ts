import type { SceneEntity } from "../scene/entityStore";
import type { StatValueMap } from "../scene/entityStats";
import type { WorldSnapshot } from "./worldSnapshot";

/**
 * A revision-stamped delta over a {@link WorldSnapshot}. The host sends one per tick to each client, carrying
 * only what changed since that client's last acknowledged revision — entity/stat/store deltas plus whole
 * snapshots of any other opted-in module (feed, leaderboard, chat, …) that changed. Fold it onto a prior
 * baseline with {@link applyWorldDiff}.
 */
export interface WorldDiff {
  revision: number;
  /**
   * The revision this diff was computed against — `sinceRevision` echoed back. A {@link WorldMirror} only applies
   * a diff whose `baseRevision` matches its own current revision exactly; a mismatch means frames were skipped and
   * the mirror must resync from a fresh baseline instead of silently drifting. Absent on a diff built by an older
   * producer — treated as legacy and always applied, matching pre-revision-checking behavior.
   */
  baseRevision?: number;
  entities: readonly SceneEntity[];
  removedEntities: readonly string[];
  stats: Record<string, StatValueMap>;
  removedStats: readonly string[];
  store: readonly (readonly [string, unknown])[];
  removedStore: readonly string[];
  /** Changed whole-module snapshots keyed by module name — everything a client can't reconstruct from deltas. */
  modules: WorldSnapshot;
  /** Module keys present in a prior baseline that no longer exist — a client drops them wholesale on apply. */
  removedModules: readonly string[];
}

const CORE_KEYS = new Set(["entities", "stats", "store"]);

interface Tracked {
  json: string;
  revision: number;
}

/**
 * Optional acceleration for {@link createWorldReplicator}: a monotone world-dirty counter (aggregated from
 * each {@link SnapshotModule.version}). When it hasn't advanced since the last commit nothing mutated, so the
 * replicator skips re-reading and re-serializing the whole world — the change-detection short-circuit item #28
 * asks for. Omit it (or pass a snapshot-only source) to keep the original full-re-serialize-per-commit behavior.
 */
export interface WorldReplicatorOptions {
  worldVersion?: () => number;
}

/**
 * Turns successive full {@link WorldSnapshot}s into per-client {@link WorldDiff}s. Each `commit()` re-reads the
 * world, stamps every item that changed with the new revision, and remembers removals; `diff(sinceRevision)`
 * then replays exactly the items stamped after that revision. Everything the tracker holds is JSON — the same
 * shape that rides the wire — so a diff is inherently serializable. Change-detection is a full re-serialize per
 * commit unless {@link WorldReplicatorOptions.worldVersion} lets an unchanged tick short-circuit before it.
  * @internal
  */
export function createWorldReplicator(
  takeSnapshot: () => WorldSnapshot,
  options: WorldReplicatorOptions = {},
) {
  const worldVersion = options.worldVersion;
  let committedVersion: number | undefined;
  let revision = 0;
  const entities = new Map<string, Tracked>();
  const removedEntities = new Map<string, number>();
  const stats = new Map<string, Tracked>();
  const removedStats = new Map<string, number>();
  const store = new Map<string, Tracked>();
  const removedStore = new Map<string, number>();
  const modules = new Map<string, Tracked>();
  const removedModules = new Map<string, number>();

  function diffMap(
    live: Map<string, string>,
    tracked: Map<string, Tracked>,
    removed: Map<string, number>,
    nextRevision: number,
  ): boolean {
    let changed = false;
    for (const [key, json] of live) {
      const prev = tracked.get(key);
      if (prev === undefined || prev.json !== json) {
        tracked.set(key, { json, revision: nextRevision });
        removed.delete(key);
        changed = true;
      }
    }
    for (const key of tracked.keys()) {
      if (!live.has(key)) {
        tracked.delete(key);
        removed.set(key, nextRevision);
        changed = true;
      }
    }
    return changed;
  }

  function commit(): number {
    if (worldVersion !== undefined) {
      const current = worldVersion();
      if (committedVersion !== undefined && current === committedVersion) return revision;
      committedVersion = current;
    }
    const snapshot = takeSnapshot();
    const nextRevision = revision + 1;

    const liveEntities = new Map<string, string>();
    for (const entity of (snapshot["entities"] ?? []) as readonly SceneEntity[]) {
      liveEntities.set(entity.id, JSON.stringify(entity));
    }
    const liveStats = new Map<string, string>();
    for (const [id, value] of Object.entries((snapshot["stats"] ?? {}) as Record<string, StatValueMap>)) {
      liveStats.set(id, JSON.stringify(value));
    }
    const liveStore = new Map<string, string>();
    for (const [key, value] of (snapshot["store"] ?? []) as readonly (readonly [string, unknown])[]) {
      liveStore.set(key, JSON.stringify(value ?? null));
    }
    const liveModules = new Map<string, string>();
    for (const [key, value] of Object.entries(snapshot)) {
      if (CORE_KEYS.has(key)) continue;
      liveModules.set(key, JSON.stringify(value ?? null));
    }

    let changed = diffMap(liveEntities, entities, removedEntities, nextRevision);
    changed = diffMap(liveStats, stats, removedStats, nextRevision) || changed;
    changed = diffMap(liveStore, store, removedStore, nextRevision) || changed;
    changed = diffMap(liveModules, modules, removedModules, nextRevision) || changed;

    if (changed) revision = nextRevision;
    return revision;
  }

  function diff(sinceRevision: number): WorldDiff {
    const changedEntities: SceneEntity[] = [];
    for (const [, tracked] of entities) {
      if (tracked.revision > sinceRevision) changedEntities.push(JSON.parse(tracked.json) as SceneEntity);
    }
    const changedStats: Record<string, StatValueMap> = {};
    for (const [id, tracked] of stats) {
      if (tracked.revision > sinceRevision) changedStats[id] = JSON.parse(tracked.json) as StatValueMap;
    }
    const changedStore: (readonly [string, unknown])[] = [];
    for (const [key, tracked] of store) {
      if (tracked.revision > sinceRevision) changedStore.push([key, JSON.parse(tracked.json) as unknown]);
    }
    const changedModules: WorldSnapshot = {};
    for (const [key, tracked] of modules) {
      if (tracked.revision > sinceRevision) changedModules[key] = JSON.parse(tracked.json) as unknown;
    }
    return {
      revision,
      baseRevision: sinceRevision,
      entities: changedEntities,
      removedEntities: keysAfter(removedEntities, sinceRevision),
      stats: changedStats,
      removedStats: keysAfter(removedStats, sinceRevision),
      store: changedStore,
      removedStore: keysAfter(removedStore, sinceRevision),
      modules: changedModules,
      removedModules: keysAfter(removedModules, sinceRevision),
    };
  }

  return { commit, diff, revision: () => revision };
}

/** The stateful diff tracker returned by {@link createWorldReplicator}: `commit()`, `diff(sinceRevision)`, `revision()`. */
export type WorldReplicator = ReturnType<typeof createWorldReplicator>;

function keysAfter(map: Map<string, number>, sinceRevision: number): string[] {
  const out: string[] = [];
  for (const [key, revision] of map) {
    if (revision > sinceRevision) out.push(key);
  }
  return out;
}

/**
 * Diff two full {@link WorldSnapshot}s directly, stamping the result at `revision` — the stateless counterpart of
 * {@link createWorldReplicator} for hosts that persist snapshots rather than keep a live tracker (Convex reconstructs
 * per invocation). `applyWorldDiff(prev, diffSnapshots(prev, next, r))` reproduces `next`. `baseRevision`, when the
 * caller knows the revision `prev` was stamped at, lets a {@link WorldMirror} verify continuity the same way a
 * `createWorldReplicator` diff does; omitted, the diff is legacy/always-apply.
  * @internal
  */
export function diffSnapshots(
  prev: WorldSnapshot,
  next: WorldSnapshot,
  revision: number,
  baseRevision?: number,
): WorldDiff {
  const prevEntities = new Map<string, string>();
  for (const entity of (prev["entities"] ?? []) as readonly SceneEntity[]) {
    prevEntities.set(entity.id, JSON.stringify(entity));
  }
  const entities: SceneEntity[] = [];
  const nextEntityIds = new Set<string>();
  for (const entity of (next["entities"] ?? []) as readonly SceneEntity[]) {
    nextEntityIds.add(entity.id);
    const json = JSON.stringify(entity);
    if (prevEntities.get(entity.id) !== json) entities.push(JSON.parse(json) as SceneEntity);
  }
  const removedEntities = [...prevEntities.keys()].filter((id) => !nextEntityIds.has(id));

  const prevStats = (prev["stats"] ?? {}) as Record<string, StatValueMap>;
  const nextStats = (next["stats"] ?? {}) as Record<string, StatValueMap>;
  const stats: Record<string, StatValueMap> = {};
  for (const [id, value] of Object.entries(nextStats)) {
    const json = JSON.stringify(value);
    if (JSON.stringify(prevStats[id]) !== json) stats[id] = JSON.parse(json) as StatValueMap;
  }
  const removedStats = Object.keys(prevStats).filter((id) => !(id in nextStats));

  const prevStore = new Map((prev["store"] ?? []) as readonly (readonly [string, unknown])[]);
  const nextStore = new Map((next["store"] ?? []) as readonly (readonly [string, unknown])[]);
  const store: (readonly [string, unknown])[] = [];
  for (const [key, value] of nextStore) {
    const json = JSON.stringify(value ?? null);
    if (JSON.stringify(prevStore.get(key) ?? null) !== json) store.push([key, JSON.parse(json) as unknown]);
  }
  const removedStore = [...prevStore.keys()].filter((key) => !nextStore.has(key));

  const modules: WorldSnapshot = {};
  const nextModuleKeys = new Set<string>();
  for (const [key, value] of Object.entries(next)) {
    if (CORE_KEYS.has(key)) continue;
    nextModuleKeys.add(key);
    const json = JSON.stringify(value ?? null);
    if (JSON.stringify(prev[key] ?? null) !== json) modules[key] = JSON.parse(json) as unknown;
  }
  const removedModules = Object.keys(prev).filter((key) => !CORE_KEYS.has(key) && !nextModuleKeys.has(key));

  return {
    revision,
    ...(baseRevision === undefined ? {} : { baseRevision }),
    entities,
    removedEntities,
    stats,
    removedStats,
    store,
    removedStore,
    modules,
    removedModules,
  };
}

/**
 * Fold a {@link WorldDiff} onto a prior {@link WorldSnapshot} baseline, returning the next full snapshot — the
 * client-side inverse of {@link createWorldReplicator}. Pure data in, pure data out: upserts changed entities,
 * stats and store keys, drops the removed ones, and replaces changed module snapshots wholesale.
  * @internal
  */
export function applyWorldDiff(baseline: WorldSnapshot, diff: WorldDiff): WorldSnapshot {
  const next: WorldSnapshot = { ...baseline };

  const entityById = new Map<string, SceneEntity>();
  for (const entity of (baseline["entities"] ?? []) as readonly SceneEntity[]) entityById.set(entity.id, entity);
  for (const entity of diff.entities) entityById.set(entity.id, entity);
  for (const id of diff.removedEntities) entityById.delete(id);
  next["entities"] = Array.from(entityById.values());

  const statsById: Record<string, StatValueMap> = { ...((baseline["stats"] ?? {}) as Record<string, StatValueMap>) };
  for (const [id, value] of Object.entries(diff.stats)) statsById[id] = value;
  for (const id of diff.removedStats) delete statsById[id];
  next["stats"] = statsById;

  const storeByKey = new Map<string, unknown>((baseline["store"] ?? []) as readonly (readonly [string, unknown])[]);
  for (const [key, value] of diff.store) storeByKey.set(key, value);
  for (const key of diff.removedStore) storeByKey.delete(key);
  next["store"] = Array.from(storeByKey.entries());

  for (const [key, value] of Object.entries(diff.modules)) next[key] = value;
  for (const key of diff.removedModules) delete next[key];

  return next;
}
