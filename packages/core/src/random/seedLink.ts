export const DEFAULT_SEED_PARAM = "seed";

function splitUrl(url: string): { base: string; query: string; hash: string } {
  const hashIndex = url.indexOf("#");
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex + 1);
  const rest = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = rest.indexOf("?");
  const base = queryIndex === -1 ? rest : rest.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : rest.slice(queryIndex + 1);
  return { base, query, hash };
}

/** @internal */
export function withSeedParam(url: string, seed: string | number, param = DEFAULT_SEED_PARAM): string {
  const { base, query, hash } = splitUrl(url);
  const params = new URLSearchParams(query);
  params.set(param, typeof seed === "number" ? seed.toString() : seed);
  const queryString = params.toString();
  return `${base}${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
}

/** @internal */
export function seedFromSearch(search: string, param = DEFAULT_SEED_PARAM): string | null {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalized);
  const value = params.get(param);
  return value === null || value === "" ? null : value;
}

/** @internal */
export function seedFromUrl(url: string, param = DEFAULT_SEED_PARAM): string | null {
  const { query } = splitUrl(url);
  return seedFromSearch(query, param);
}

/** @internal */
export function dailySeed(nowMs: number, salt?: string): string {
  const date = new Date(nowMs);
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  const base = `${year}-${month}-${day}`;
  return salt !== undefined && salt.length > 0 ? `${base}:${salt}` : base;
}
