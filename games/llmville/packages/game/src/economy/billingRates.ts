import { sanitizeGameTimeScale, SECONDS_PER_GAME_DAY } from "@jgengine/core/time/gameClock";

/**
 * Daily utility rates (per kW of draw or liquid-cooling capacity). Tuned so a garage build near its
 * power/cooling edge spends ~40–70% of gross serving income on utilities.
 */
export const ELECTRICITY_RATE_PER_KW = 500;

/** Water bill rate per waterConsumption unit (from cooling catalog) per game-day billing cycle. */
export const COOLANT_RATE_PER_KW = 12;


export function computeBillDueAt(now: number, timeScale: number | null | undefined, gracePeriodDays: number): number {
  return now + gracePeriodDays * ((SECONDS_PER_GAME_DAY * 1000) / sanitizeGameTimeScale(timeScale));
}
