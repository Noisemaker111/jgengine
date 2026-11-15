import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { MAP_IDS, type MapId } from "../maps";
import { campaign, type CampaignState } from "./campaign";

/**
 * The season above the days: the town's districts, worked in order. Main Street is open from the
 * first day; every other district opens once the one before it has been held. A district's best
 * stars stay on the career, so the season map shows how well each one was kept.
 */

/** Best stars a district has been held for (0 when it never has). */
export function districtStars(state: CampaignState, id: MapId): number {
  return state.districts[id] ?? 0;
}

/** Whether a district can be worked: the first always, any other once the one before it was held. */
export function districtOpen(state: CampaignState, id: MapId): boolean {
  const at = MAP_IDS.indexOf(id);
  if (at <= 0) return at === 0;
  return districtStars(state, MAP_IDS[at - 1]!) > 0;
}

/** Keep a finished day's stars on its district, best only. A lost day (0 stars) records nothing. */
export function recordDistrict(ctx: GameContext, id: MapId, stars: number): void {
  if (stars <= 0) return;
  const state = campaign.read(ctx);
  if (districtStars(state, id) >= stars) return;
  campaign.write(ctx, { ...state, districts: { ...state.districts, [id]: stars } });
}

/** How far the season has come: districts held of every district. */
export function seasonProgress(state: CampaignState): { held: number; total: number } {
  return { held: MAP_IDS.filter((id) => districtStars(state, id) > 0).length, total: MAP_IDS.length };
}

/** The district the season points to next from `from`: the first open one not yet held, or null when every district is held. */
export function nextDistrict(state: CampaignState, from: MapId): MapId | null {
  const order = [...MAP_IDS.slice(MAP_IDS.indexOf(from) + 1), ...MAP_IDS.slice(0, MAP_IDS.indexOf(from) + 1)];
  return order.find((id) => districtOpen(state, id) && districtStars(state, id) === 0) ?? null;
}
