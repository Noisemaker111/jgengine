import { seedFromSearch, withSeedParam } from "@jgengine/core/random/seedLink";

import { DIFFICULTIES, normalizeConfig, type BoardConfig, type Difficulty } from "./board";

const DIFF_PARAM = "d";
const COLS_PARAM = "c";
const ROWS_PARAM = "r";
const MINES_PARAM = "m";
const FALLBACK_URL = "https://flag-sweep.local/";

export interface UrlBoardSpec {
  seed: string;
  difficulty: Difficulty;
  config: BoardConfig;
}

function currentHref(): string {
  return typeof location !== "undefined" ? location.href : FALLBACK_URL;
}

function isDifficulty(value: string | null): value is Difficulty {
  return (
    value === "beginner" ||
    value === "intermediate" ||
    value === "expert" ||
    value === "custom"
  );
}

export function shareUrl(seed: string, difficulty: Difficulty, config: BoardConfig): string {
  const url = new URL(withSeedParam(currentHref(), seed));
  url.searchParams.set(DIFF_PARAM, difficulty);
  if (difficulty === "custom") {
    url.searchParams.set(COLS_PARAM, String(config.cols));
    url.searchParams.set(ROWS_PARAM, String(config.rows));
    url.searchParams.set(MINES_PARAM, String(config.mines));
  } else {
    url.searchParams.delete(COLS_PARAM);
    url.searchParams.delete(ROWS_PARAM);
    url.searchParams.delete(MINES_PARAM);
  }
  return url.toString();
}

export function pushUrl(url: string): void {
  if (typeof history !== "undefined") history.replaceState(null, "", url);
}

export function readUrlSpec(): UrlBoardSpec | null {
  if (typeof location === "undefined") return null;
  const seed = seedFromSearch(location.search);
  if (seed === null) return null;
  const params = new URLSearchParams(location.search);
  const rawDifficulty = params.get(DIFF_PARAM);
  const difficulty: Difficulty = isDifficulty(rawDifficulty) ? rawDifficulty : "beginner";
  if (difficulty === "custom") {
    const config = normalizeConfig(
      Number(params.get(COLS_PARAM) ?? "16"),
      Number(params.get(ROWS_PARAM) ?? "16"),
      Number(params.get(MINES_PARAM) ?? "40"),
    );
    return { seed, difficulty, config };
  }
  return { seed, difficulty, config: DIFFICULTIES[difficulty] };
}
