import { dailySeed, seedFromUrl, withSeedParam } from "@jgengine/core/random/seedLink";

let counter = 0;

export function newSeed(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function seedFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  return seedFromUrl(window.location.href);
}

export function todaySeed(): string {
  return dailySeed(Date.now());
}

export function shareUrl(seed: string): string {
  const base = typeof window !== "undefined" ? window.location.href : "https://jgengine.com/games/klondike";
  return withSeedParam(base, seed);
}
