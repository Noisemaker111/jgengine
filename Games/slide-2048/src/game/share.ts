import { seedFromSearch, withSeedParam } from "@jgengine/core/random/seedLink";

const FALLBACK_URL = "https://jgengine.com/games/slide-2048";

export function readSeedFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return seedFromSearch(window.location.search);
  } catch {
    return null;
  }
}

export function shareLinkFor(seed: string): string {
  const base = typeof window === "undefined" ? FALLBACK_URL : window.location.href;
  return withSeedParam(base, seed);
}

export function updateLocationSeed(seed: string): void {
  if (typeof window === "undefined" || typeof window.history === "undefined") return;
  try {
    window.history.replaceState(null, "", withSeedParam(window.location.href, seed));
  } catch {
    /* history unavailable — non-fatal, gameplay is unaffected */
  }
}
