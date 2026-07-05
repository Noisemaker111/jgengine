export interface PoolStat {
  current: number;
  max: number;
  min: number;
}

export interface PoolStatPatch {
  current?: number;
  max?: number;
  min?: number;
}

export type PoolStatMap = Record<string, PoolStat>;

export type PoolStatCatalog = Record<string, { max: number; min?: number; current?: number }>;

export type PoolDeltaResult =
  | { status: "ok"; map: PoolStatMap; stat: PoolStat; hitMin: boolean; hitMax: boolean }
  | { status: "rejected"; reason: string };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getPoolStat(map: PoolStatMap, statId: string): PoolStat | null {
  return map[statId] ?? null;
}

export function setPoolStat(map: PoolStatMap, statId: string, patch: PoolStatPatch): PoolStatMap {
  const existing = map[statId];
  const max = patch.max ?? existing?.max ?? 0;
  const min = patch.min ?? existing?.min ?? 0;
  const current = clamp(patch.current ?? existing?.current ?? max, min, max);
  return { ...map, [statId]: { current, max, min } };
}

export function applyPoolDelta(map: PoolStatMap, statId: string, amount: number): PoolDeltaResult {
  const existing = map[statId];
  if (existing === undefined) {
    return { status: "rejected", reason: `unknown stat "${statId}"` };
  }
  const current = clamp(existing.current + amount, existing.min, existing.max);
  const stat = { ...existing, current };
  return {
    status: "ok",
    map: { ...map, [statId]: stat },
    stat,
    hitMin: current === existing.min,
    hitMax: current === existing.max,
  };
}

export function seedPoolStats(catalogStats: PoolStatCatalog): PoolStatMap {
  const map: PoolStatMap = {};
  for (const [statId, declaration] of Object.entries(catalogStats)) {
    const min = declaration.min ?? 0;
    const current = clamp(declaration.current ?? declaration.max, min, declaration.max);
    map[statId] = { current, max: declaration.max, min };
  }
  return map;
}

export interface EntityStatsApi {
  get(instanceId: string, statId: string): PoolStat | null;
  set(instanceId: string, statId: string, patch: PoolStatPatch): boolean;
  delta(instanceId: string, statId: string, amount: number): null | { reason: string };
}

export function createEntityStatsApi(
  resolve: (instanceId: string) => PoolStatMap | undefined,
): EntityStatsApi {
  return {
    get(instanceId, statId) {
      const map = resolve(instanceId);
      if (map === undefined) return null;
      return getPoolStat(map, statId);
    },
    set(instanceId, statId, patch) {
      const map = resolve(instanceId);
      if (map === undefined) return false;
      const next = setPoolStat(map, statId, patch);
      map[statId] = next[statId]!;
      return true;
    },
    delta(instanceId, statId, amount) {
      const map = resolve(instanceId);
      if (map === undefined) return { reason: `unknown instance "${instanceId}"` };
      const result = applyPoolDelta(map, statId, amount);
      if (result.status === "rejected") return { reason: result.reason };
      map[statId] = result.stat;
      return null;
    },
  };
}
