import { seedFromSearch, withSeedParam } from "@jgengine/core/random/seedLink";

import type { Options } from "./codebreaker";

const DUP_PARAM = "u";
const HARD_PARAM = "h";
const FALLBACK_URL = "https://codebreaker.local/";

export interface UrlSpec {
  readonly seed: string;
  readonly options: Options;
}

function currentHref(): string {
  return typeof location !== "undefined" ? location.href : FALLBACK_URL;
}

/** A shareable link that reproduces the exact code (seed + rules). */
export function shareUrl(seed: string, options: Options): string {
  const url = new URL(withSeedParam(currentHref(), seed));
  url.searchParams.set(DUP_PARAM, options.duplicates ? "1" : "0");
  url.searchParams.set(HARD_PARAM, options.hard ? "1" : "0");
  return url.toString();
}

export function pushUrl(url: string): void {
  if (typeof history !== "undefined") history.replaceState(null, "", url);
}

export function readUrlSpec(): UrlSpec | null {
  if (typeof location === "undefined") return null;
  const seed = seedFromSearch(location.search);
  if (seed === null) return null;
  const params = new URLSearchParams(location.search);
  const duplicates = params.get(DUP_PARAM) !== "0"; // default on
  const hard = params.get(HARD_PARAM) === "1";
  return { seed, options: { duplicates, hard } };
}
