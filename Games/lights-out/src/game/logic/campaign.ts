import { seededRng } from "@jgengine/core/random/rng";

import { CELLS, PRESS_MASKS } from "./board";
import { optimalPressCount } from "./solver";

export const LEVEL_COUNT = 30;
const CAMPAIGN_SEED = "lights-out/campaign/v1";
const RANDOM_SEED_PREFIX = "lights-out/random";

export interface GeneratedBoard {
  readonly board: number;
  readonly par: number;
}

export function parForLevel(level: number): number {
  const clamped = Math.max(0, Math.min(LEVEL_COUNT - 1, level));
  return 3 + Math.round((clamped / (LEVEL_COUNT - 1)) * 14);
}

function buildFromPresses(rng: () => number, targetPresses: number): number {
  const pressed = new Set<number>();
  for (let guard = 0; guard < 100_000; guard += 1) {
    const cell = Math.floor(rng() * CELLS);
    if (pressed.has(cell)) pressed.delete(cell);
    else pressed.add(cell);
    if (pressed.size === targetPresses) {
      let board = 0;
      for (const c of pressed) board ^= PRESS_MASKS[c];
      if (board !== 0) return board >>> 0;
    }
  }
  let board = 0;
  for (const c of pressed) board ^= PRESS_MASKS[c];
  return board >>> 0;
}

export function generateCampaignBoard(level: number): GeneratedBoard {
  const par = parForLevel(level);
  const rng = seededRng(`${CAMPAIGN_SEED}:${level}`);
  const board = buildFromPresses(rng, par);
  return { board, par };
}

export function generateRandomBoard(seed: string): GeneratedBoard {
  const rng = seededRng(`${RANDOM_SEED_PREFIX}:${seed}`);
  const targetPresses = 6 + Math.floor(rng() * 12);
  const board = buildFromPresses(rng, targetPresses);
  const optimal = optimalPressCount(board);
  return { board, par: optimal ?? targetPresses };
}

export function starsFor(presses: number, par: number): number {
  if (presses <= par) return 3;
  if (presses <= par + 3) return 2;
  return 1;
}
