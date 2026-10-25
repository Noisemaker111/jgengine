import type { ParkMetrics } from "../park";

/**
 * The rating's blend: what the park offers (appeal and variety, from the world's totals), how the
 * crowd feels, how many came today and how clean it is. Pure math over world facts.
 */
export function ratingTarget(
  metrics: Pick<ParkMetrics, "totalAppeal" | "variety">,
  mood: number,
  guestsToday: number,
  litter: number,
  complaints = 0,
): number {
  const appealScore = metrics.totalAppeal * 3.4;
  const varietyBonus = metrics.variety * 9;
  const happyScore = (mood - 40) * 1.6;
  const throughput = Math.min(guestsToday, 400) * 0.28;
  const litterPenalty = litter * 1.4;
  // Guests saying "too expensive", "lost", "this queue is too long": their share of the crowd costs stars.
  const complaintPenalty = Math.min(1, complaints) * 160;
  return Math.max(0, appealScore + varietyBonus + happyScore + throughput - litterPenalty - complaintPenalty);
}

/**
 * Guests through the gate per second while it is open: a trickle a new park earns, more for every
 * point of appeal and rating; an entry ticket above what the park is worth turns them away.
 */
export function demand(totalAppeal: number, ticketPrice: number, rating: number, open: boolean): number {
  if (!open) return 0;
  const perMinute = 14 + totalAppeal * 0.9 + rating * 0.08;
  const worth = 4 + totalAppeal * 0.15 + rating * 0.02;
  const priceResistance = Math.max(0, Math.min(1, 1 - (ticketPrice - worth) * 0.05));
  return (perMinute / 60) * priceResistance;
}
