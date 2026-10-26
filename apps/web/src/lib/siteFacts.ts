import loadBaseline from "../../../../scripts/load-baseline.json";

/**
 * Numbers the site quotes, read from the files that measure them so a claim cannot outlive its
 * measurement. The load baseline is what `bun run shoot --load --guard` (run by verify:fast) holds
 * every game to: a cold load in a fresh browser profile on the machine that recorded it.
 */
const loads = Object.values(loadBaseline.games as Record<string, { worstClick: number | null; sceneReady: number | null }>);

/** The slowest menu click across every measured game while it loads, in ms. */
export const WORST_MENU_CLICK_MS = Math.max(...loads.map((game) => game.worstClick ?? 0));

/** Fastest and slowest cold "scene ready" across the measured games, in ms. */
export const SCENE_READY_RANGE_MS: readonly [number, number] = [
  Math.min(...loads.map((game) => game.sceneReady ?? Number.POSITIVE_INFINITY)),
  Math.max(...loads.map((game) => game.sceneReady ?? 0)),
];

/** How many games the load guard measures. */
export const MEASURED_GAME_COUNT = loads.length;

/** The GPU the baseline was recorded on, short form ("RTX 3070"). */
export const BASELINE_GPU = /GeForce\s+([^(]+?)\s*\(/.exec(loadBaseline.gpu)?.[1] ?? "a desktop GPU";

/** `ms` as seconds rounded up to one decimal: 771 → "0.8 s". */
export function secondsCeil(ms: number): string {
  return `${(Math.ceil(ms / 100) / 10).toFixed(1)} s`;
}
