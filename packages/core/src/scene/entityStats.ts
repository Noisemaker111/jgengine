import {
  changeStatPool,
  createStatPool,
  patchStatPool,
  type StatPool,
  type StatPoolAccess,
  type StatPoolPatch,
} from "../stats/statPool";

/** Native entity-stat name retained as a compatibility bridge to the portable pool model. */
export interface StatValue extends StatPool {}

/** Native entity-stat patch retained as a compatibility bridge. */
export interface StatValuePatch extends StatPoolPatch {}

export type StatValueMap = Record<string, StatValue>;

export type StatCatalog = Record<string, { max: number; min?: number; current?: number }>;

export type PoolDeltaResult =
  | { status: "ok"; map: StatValueMap; stat: StatValue; hitMin: boolean; hitMax: boolean }
  | { status: "rejected"; reason: string };

/** @internal */
export function getStatValue(map: StatValueMap, statId: string): StatValue | null {
  return map[statId] ?? null;
}

/** @internal */
export function setStatValue(map: StatValueMap, statId: string, patch: StatValuePatch): StatValueMap {
  const existing = map[statId];
  const next =
    existing === undefined
      ? createStatPool({ max: patch.max ?? 0, min: patch.min, current: patch.current })
      : patchStatPool(existing, patch);
  return { ...map, [statId]: next };
}

/** @internal */
export function applyPoolDelta(map: StatValueMap, statId: string, amount: number): PoolDeltaResult {
  const existing = map[statId];
  if (existing === undefined) {
    return { status: "rejected", reason: `unknown stat "${statId}"` };
  }
  const change = changeStatPool(existing, amount);
  const stat = change.pool;
  // No-op change: `changeStatPool` handed back the same pool reference, so keep
  // the existing map too — callers can guard on reference identity.
  if (stat === existing) {
    return { status: "ok", map, stat, hitMin: change.hitMin, hitMax: change.hitMax };
  }
  return {
    status: "ok",
    map: { ...map, [statId]: stat },
    stat,
    hitMin: change.hitMin,
    hitMax: change.hitMax,
  };
}

/** @internal */
export function seedStatValues(catalogStats: StatCatalog): StatValueMap {
  const map: StatValueMap = {};
  for (const [statId, declaration] of Object.entries(catalogStats)) {
    map[statId] = createStatPool(declaration);
  }
  return map;
}

/** Deep-copy the per-entity stat maps into a serializable record — the transport counterpart of {@link hydrateEntityStats}.
 * @internal
 */
export function snapshotEntityStats(
  store: ReadonlyMap<string, StatValueMap>,
): Record<string, StatValueMap> {
  const out: Record<string, StatValueMap> = {};
  for (const [instanceId, map] of store) {
    const copy: StatValueMap = {};
    for (const [statId, value] of Object.entries(map)) copy[statId] = { ...value };
    out[instanceId] = copy;
  }
  return out;
}

/** Replace a live stat store with deep copies of a snapshot, clearing entities absent from it.
 * @internal
 */
export function hydrateEntityStats(
  store: Map<string, StatValueMap>,
  data: Record<string, StatValueMap>,
): void {
  store.clear();
  for (const [instanceId, map] of Object.entries(data)) {
    const copy: StatValueMap = {};
    for (const [statId, value] of Object.entries(map)) copy[statId] = { ...value };
    store.set(instanceId, copy);
  }
}

/** Native entity-stat adapter over the portable {@link StatPoolAccess} contract. */
export interface EntityStatsApi extends StatPoolAccess {
  get(instanceId: string, statId: string): StatValue | null;
  set(instanceId: string, statId: string, patch: StatValuePatch): boolean;
  delta(instanceId: string, statId: string, amount: number): null | { reason: string };
}

/** @internal */
export function createEntityStatsApi(
  resolve: (instanceId: string) => StatValueMap | undefined,
): EntityStatsApi {
  return {
    get(instanceId, statId) {
      const map = resolve(instanceId);
      if (map === undefined) return null;
      return getStatValue(map, statId);
    },
    set(instanceId, statId, patch) {
      const map = resolve(instanceId);
      if (map === undefined) return false;
      const next = setStatValue(map, statId, patch);
      map[statId] = next[statId]!;
      return true;
    },
    delta(instanceId, statId, amount) {
      const map = resolve(instanceId);
      if (map === undefined) return { reason: `unknown instance "${instanceId}"` };
      const existing = map[statId];
      const result = applyPoolDelta(map, statId, amount);
      if (result.status === "rejected") return { reason: result.reason };
      // Skip the store write when nothing moved so reference guards stay stable.
      if (result.stat !== existing) map[statId] = result.stat;
      return null;
    },
  };
}
