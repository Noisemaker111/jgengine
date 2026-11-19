export interface MilestoneDef {
  id: string;
  rating: number;
  label: string;
  prize: number;
  blurb: string;
}

export const MILESTONES: readonly MilestoneDef[] = [
  { id: "tidy_start", rating: 250, label: "Promising Newcomer", prize: 500, blurb: "The local paper says nice things." },
  { id: "family_fun", rating: 400, label: "Best Family Day Out", prize: 1000, blurb: "Coach trips start coming." },
  { id: "thrill_seekers", rating: 550, label: "Thrill Seekers' Pick", prize: 1500, blurb: "The coaster crowd has noticed." },
  { id: "seaside_star", rating: 700, label: "Seaside Star", prize: 2500, blurb: "A regional tourism award." },
  { id: "blue_ribbon", rating: 850, label: "Blue Ribbon Park", prize: 4000, blurb: "The best park on the coast." },
  { id: "legend", rating: 950, label: "Park of Legend", prize: 6000, blurb: "People travel across the country for this." },
];

export const BLUE_RIBBON = { rides: 8, rating: 600, mood: 60, litter: 30 } as const;

/** The first award the rating has not reached, or null when all are won. */
export function nextMilestone(rating: number): MilestoneDef | null {
  return MILESTONES.find((m) => rating < m.rating) ?? null;
}

export function milestonesCrossed(before: number, after: number): readonly MilestoneDef[] {
  return MILESTONES.filter((m) => before < m.rating && after >= m.rating);
}
