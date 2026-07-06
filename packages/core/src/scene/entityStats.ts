export interface StatValue {
  current: number;
  max: number;
  min: number;
}

export interface StatValuePatch {
  current?: number;
  max?: number;
  min?: number;
}

export type StatValueMap = Record<string, StatValue>;

export type StatCatalog = Record<string, { max: number; min?: number; current?: number }>;

export type PoolDeltaResult =
  | { status: "ok"; map: StatValueMap; stat: StatValue; hitMin: boolean; hitMax: boolean }
  | { status: "rejected"; reason: string };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getStatValue(map: StatValueMap, statId: string): StatValue | null {
  return map[statId] ?? null;
}

export function setStatValue(map: StatValueMap, statId: string, patch: StatValuePatch): StatValueMap {
  const existing = map[statId];
  const max = patch.max ?? existing?.max ?? 0;
  const min = patch.min ?? existing?.min ?? 0;
  const current = clamp(patch.current ?? existing?.current ?? max, min, max);
  return { ...map, [statId]: { current, max, min } };
}

export function applyPoolDelta(map: StatValueMap, statId: string, amount: number): PoolDeltaResult {
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

export function seedStatValues(catalogStats: StatCatalog): StatValueMap {
  const map: StatValueMap = {};
  for (const [statId, declaration] of Object.entries(catalogStats)) {
    const min = declaration.min ?? 0;
    const current = clamp(declaration.current ?? declaration.max, min, declaration.max);
    map[statId] = { current, max: declaration.max, min };
  }
  return map;
}

export interface EntityStatsApi {
  get(instanceId: string, statId: string): StatValue | null;
  set(instanceId: string, statId: string, patch: StatValuePatch): boolean;
  delta(instanceId: string, statId: string, amount: number): null | { reason: string };
}

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
      const result = applyPoolDelta(map, statId, amount);
      if (result.status === "rejected") return { reason: result.reason };
      map[statId] = result.stat;
      return null;
    },
  };
}
