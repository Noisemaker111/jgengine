import type { ParkMetrics } from "../park";

/** What each ghost in residence adds to the rumor (kept here, beside the blend it is part of). */
export const GHOST_RUMOR = 35;

/**
 * The rumor's blend: what the park offers (appeal and variety, from the world's totals), how the
 * living feel about their night, how many came, how many ran out screaming since noon, how many
 * ghosts live here and how clean it is. Pure math over world facts.
 */
export function ratingTarget(
  metrics: Pick<ParkMetrics, "totalAppeal" | "variety">,
  mood: number,
  guestsToday: number,
  litter: number,
  complaints = 0,
  screamsToday = 0,
  ghosts = 0,
): number {
  const appealScore = metrics.totalAppeal * 3.4;
  const varietyBonus = metrics.variety * 9;
  // An empty park has no crowd to be happy: the mood counts once someone has come through the gate.
  const happyScore = guestsToday > 0 ? (mood - 40) * 1.6 : 0;
  const throughput = Math.min(guestsToday, 400) * 0.28;
  const litterPenalty = litter * 1.4;
  // Visitors saying "too scary to go in", "lost", "this queue is too long": their share of the crowd costs rumor.
  const complaintPenalty = Math.min(1, complaints) * 160;
  // Every scream on the coast road is a story told in town.
  const screamScore = Math.min(screamsToday, 120) * 1.1;
  const ghostScore = ghosts * GHOST_RUMOR;
  return Math.max(0, appealScore + varietyBonus + happyScore + throughput + screamScore + ghostScore - litterPenalty - complaintPenalty);
}

/**
 * The living through the gate per second while it is night and the gate is open: a trickle a new
 * haunt earns (one every 15 seconds or so with a single ride), more for every point of rumor and
 * appeal, multiplied by any rumors being spread; a gate toll above what the park is worth turns
 * them away.
 */
export function demand(totalAppeal: number, ticketPrice: number, rating: number, open: boolean, marketing = 1): number {
  if (!open) return 0;
  const perMinute = (3 + totalAppeal * 0.2 + rating * 0.04) * marketing;
  const worth = 4 + totalAppeal * 0.15 + rating * 0.02;
  const priceResistance = Math.max(0, Math.min(1, 1 - (ticketPrice - worth) * 0.05));
  return (perMinute / 60) * priceResistance;
}
