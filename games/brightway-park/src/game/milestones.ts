/**
 * The haunt's rumor awards: the first time the park's best rumor (`park.peak`) crosses one, its
 * prize lands in the vault through the world's `award` ripple. New rides come from the séance table
 * and the ghosts, not from awards; an award is the reason to chase the next band of rumor.
 */

export interface MilestoneDef {
  id: string;
  /** Park rumor that earns it. */
  rating: number;
  label: string;
  /** Ectoplasm prize paid once. */
  prize: number;
  blurb: string;
}

export const MILESTONES: readonly MilestoneDef[] = [
  { id: "campfire_story", rating: 250, label: "Campfire Story", prize: 500, blurb: "Scouts dare each other to climb the fence." },
  { id: "local_legend", rating: 400, label: "Local Legend", prize: 1000, blurb: "The pub has a name for the noises on the pier." },
  { id: "viral_video", rating: 550, label: "Viral Video", prize: 1500, blurb: "A shaky clip of the carousel gets a million views." },
  { id: "most_haunted", rating: 700, label: "Most Haunted on the Coast", prize: 2500, blurb: "The paranormal society's top pick." },
  { id: "place_you_dont_go", rating: 850, label: "The Place You Don't Go", prize: 4000, blurb: "Taxi drivers won't take the coast road after dark." },
  { id: "full_moon_legend", rating: 950, label: "Legend of the Full Moon", prize: 6000, blurb: "People cross the country to be scared here." },
];

/** Free play's own goal, a ghost paradise: a big, scary, tidy park that pays its way and houses ghosts. */
export const BLUE_RIBBON = { rides: 8, rating: 600, mood: 60, litter: 30, ghosts: 4 } as const;

/** The first award the rumor has not reached, or null when all are won. */
export function nextMilestone(rating: number): MilestoneDef | null {
  return MILESTONES.find((m) => rating < m.rating) ?? null;
}

/** Awards crossed when the park's best rumor moves from `before` to `after`. */
export function milestonesCrossed(before: number, after: number): readonly MilestoneDef[] {
  return MILESTONES.filter((m) => before < m.rating && after >= m.rating);
}
