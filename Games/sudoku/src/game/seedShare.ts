import { seedFromSearch, withSeedParam } from "@jgengine/core/random/seedLink";

import { DIFFICULTIES, type Difficulty } from "./sudoku/difficulty";

const DIFF_PARAM = "d";
const FALLBACK_URL = "https://sudoku.local/";

export interface UrlSpec {
  seed: string;
  difficulty: Difficulty;
}

function currentHref(): string {
  return typeof location !== "undefined" ? location.href : FALLBACK_URL;
}

function isDifficulty(value: string | null): value is Difficulty {
  return value !== null && (DIFFICULTIES as string[]).includes(value);
}

export function shareUrl(seed: string, difficulty: Difficulty): string {
  const url = new URL(withSeedParam(currentHref(), seed));
  url.searchParams.set(DIFF_PARAM, difficulty);
  return url.toString();
}

export function pushUrl(url: string): void {
  if (typeof history !== "undefined") history.replaceState(null, "", url);
}

export function readUrlSpec(): UrlSpec | null {
  if (typeof location === "undefined") return null;
  const seed = seedFromSearch(location.search);
  if (seed === null) return null;
  const raw = new URLSearchParams(location.search).get(DIFF_PARAM);
  return { seed, difficulty: isDifficulty(raw) ? raw : "easy" };
}
