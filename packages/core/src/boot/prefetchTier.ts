/** `near`: what the first view of the world needs. `far`: distance and LOD versions, fetched after. */
export type PrefetchTier = "near" | "far";

/** One file to fetch ahead: the root-absolute path the game asks for. */
export interface PrefetchItem {
  path: string;
  tier: PrefetchTier;
}

const FAR_PATH = /(^|[/_.-])(far|lod\d*|lowpoly|impostor)([/_.-]|$)/i;

/** A file's tier from its path: distance and LOD versions are `far`, everything else `near`. @internal */
export function prefetchTier(path: string): PrefetchTier {
  return FAR_PATH.test(path) ? "far" : "near";
}

/** Order a list near tier first, keeping each tier's own order and dropping repeats. */
export function orderPrefetch(items: readonly PrefetchItem[]): PrefetchItem[] {
  const seen = new Set<string>();
  const unique = items.filter((item) => !seen.has(item.path) && seen.add(item.path));
  return [...unique.filter((item) => item.tier === "near"), ...unique.filter((item) => item.tier === "far")];
}
