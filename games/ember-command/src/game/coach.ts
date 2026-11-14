/**
 * The field coach: one-time tips that name the next useful verb at the moment it matters, instead of
 * a tutorial wall. Each tip has a pure trigger over a small snapshot of the battle; `systems.ts` builds
 * the snapshot once a second and pushes whichever tips fire, once each per battle.
 */

export interface CoachFacts {
  /** Battle seconds. */
  elapsed: number;
  /** Workers currently on a forage order. */
  foraging: number;
  /** Whether any scent is on the lawn, and whether the commander painted a line yet. */
  scented: boolean;
  trailPainted: boolean;
  hasBarracks: boolean;
  /** Brood room used + reserved against the cap. */
  broodFull: boolean;
  night: boolean;
  /** A hostile has been seen by the colony. */
  enemySeen: boolean;
  /** The magnifying glass is in this battle. */
  beam: boolean;
  /** The free skirmish runs no orders card, so the coach names the goal. */
  skirmish: boolean;
}

export interface CoachTip {
  id: string;
  text: string;
  when: (facts: CoachFacts) => boolean;
}

export const COACH_TIPS: readonly CoachTip[] = [
  {
    id: "forage",
    text: "Tip: drag a box around your workers and right-click the cookie crumbs. Laden workers scent the way home.",
    when: (f) => f.elapsed >= 6 && f.foraging === 0,
  },
  {
    id: "trail",
    text: "Tip: press P, then right-click: a Pheromone Line from your selected ants. Red ants run up to 40% faster on scent — but black raiders can smell it too.",
    when: (f) => f.elapsed >= 25 && f.scented && !f.trailPainted,
  },
  {
    id: "barracks",
    text: "Tip: press B and right-click open lawn to dig a Barracks Chamber: Soldiers, Spitters and Beetles hatch there.",
    when: (f) => f.elapsed >= 45 && !f.hasBarracks,
  },
  {
    id: "brood",
    text: "Tip: the brood room is full. Press G to dig a Fungus Garden and feed more larvae.",
    when: (f) => f.broodFull,
  },
  {
    id: "enemy",
    text: "Black ants! Soldiers (2) screen, Spitters (3) melt them from behind. When an ant dies, alarm scent makes its comrades bite harder.",
    when: (f) => f.enemySeen,
  },
  {
    id: "night",
    text: "Night shortens every antenna. Scouts (9) on a scent trail and ants on patio stones still see far.",
    when: (f) => f.night,
  },
  {
    id: "beam",
    text: "The kid hunts the biggest knot of ants in the open. Hide under the giant leaves, and lure the beam onto the black nest: it burns them too.",
    when: (f) => f.beam && f.elapsed >= 3,
  },
  {
    id: "skirmish",
    text: "Free skirmish: dig out the Black Ant Nest at the far end of the lawn. The sprinkler, mower, rain and night all run.",
    when: (f) => f.skirmish && f.elapsed >= 2,
  },
];

/** The tips that fire now and have not been shown yet. */
export function dueTips(facts: CoachFacts, seen: readonly string[]): CoachTip[] {
  return COACH_TIPS.filter((tip) => !seen.includes(tip.id) && tip.when(facts));
}
