export type PrefetchTier = "near" | "far";

export interface PrefetchItem {
  path: string;
  tier: PrefetchTier;
}

const FAR_PATH = /(^|[/_.-])(far|lod\d*|lowpoly|impostor)([/_.-]|$)/i;

/** @internal */
export function prefetchTier(path: string): PrefetchTier {
  return FAR_PATH.test(path) ? "far" : "near";
}

export function orderPrefetch(items: readonly PrefetchItem[]): PrefetchItem[] {
  const seen = new Set<string>();
  const unique = items.filter((item) => !seen.has(item.path) && seen.add(item.path));
  return [...unique.filter((item) => item.tier === "near"), ...unique.filter((item) => item.tier === "far")];
}
