import { CORRIDOR_HALF_WIDTH } from "../constants";
import type { TierDef } from "../difficulty/tiers";
import { roadOccupiesBand } from "../vehicles/schedule";
import type { RoadDef } from "./catalog";

export interface GapForecast {
  openNow: boolean;
  windowStart: number;
  windowEnd: number;
  windowWidth: number;
}

const HORIZON_SECONDS = 20;
const STEP_SECONDS = 0.08;

export function forecastGap(road: RoadDef, tier: TierDef, atT: number): GapForecast {
  const occupiedAt = (t: number) => roadOccupiesBand(road, tier, t, CORRIDOR_HALF_WIDTH);
  const limit = atT + HORIZON_SECONDS;

  if (!occupiedAt(atT)) {
    let end = atT;
    while (end < limit && !occupiedAt(end)) end += STEP_SECONDS;
    return { openNow: true, windowStart: atT, windowEnd: end, windowWidth: end - atT };
  }

  let start = atT;
  while (start < limit && occupiedAt(start)) start += STEP_SECONDS;
  let end = start;
  while (end < limit && !occupiedAt(end)) end += STEP_SECONDS;
  return { openNow: false, windowStart: start, windowEnd: end, windowWidth: end - start };
}
