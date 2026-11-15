export const GUEST_WALK_SPEED = 4.2;

export const GUEST_SCALE = 0.9;

/**
 * The living who come through the gate after dusk, as data. Each kind arrives in a group, with its
 * own courage (the nerve a scare spends; at zero they flee screaming), curiosity (how many stops
 * they make before they wander home) and taste in Thrill. Three kinds are trouble: skeptics shrug
 * off cheap scares, and ghost hunters and TV crews film what they see.
 */
export interface VisitorKind {
  id: string;
  label: string;
  /** Starting nerve, low to high. */
  courage: readonly [number, number];
  /** Stops a visitor of this kind makes before going home, 0-1 of the park's most. */
  curiosity: number;
  /** The Thrill they enjoy most, 0-10. */
  thrill: number;
  /** How many come through the gate together, low to high. */
  group: readonly [number, number];
  /** Rumor the park must have before this kind turns up at all. */
  rumor: number;
  /** How often this kind turns up among the groups, relative to the others. */
  weight: number;
  /** Shrugs off scare props below the skeptic line. */
  skeptic?: boolean;
  /** Films scares: footage per point of Fright witnessed (lost if they flee screaming). */
  films?: number;
}

export const VISITORS: readonly VisitorKind[] = [
  { id: "visitor_teen", label: "Dared Teen", courage: [12, 24], curiosity: 1, thrill: 7.5, group: [2, 4], rumor: 0, weight: 4 },
  { id: "visitor_couple", label: "Couple on a Date", courage: [14, 28], curiosity: 0.8, thrill: 5.5, group: [2, 2], rumor: 0, weight: 3 },
  { id: "visitor_family", label: "Brave Family", courage: [10, 18], curiosity: 0.7, thrill: 3.5, group: [3, 4], rumor: 0, weight: 3 },
  { id: "visitor_skeptic", label: "Skeptic", courage: [24, 36], curiosity: 0.9, thrill: 6, group: [1, 1], rumor: 40, weight: 1.2, skeptic: true },
  { id: "visitor_hunter", label: "Ghost Hunter", courage: [22, 34], curiosity: 1, thrill: 6, group: [1, 2], rumor: 150, weight: 1, films: 1 },
  { id: "visitor_tvcrew", label: "Paranormal TV Crew", courage: [20, 32], curiosity: 0.9, thrill: 5, group: [2, 3], rumor: 320, weight: 0.7, films: 2 },
];

/** Every visitor kind's entity id: what the scene spawns and the save decoder accepts. */
export const GUEST_KINDS: readonly string[] = VISITORS.map((kind) => kind.id);

const BY_ID = new Map(VISITORS.map((kind) => [kind.id, kind]));

/** A visitor kind's card; an unknown id reads as a teen. */
export function visitorKind(id: string): VisitorKind {
  return BY_ID.get(id) ?? VISITORS[0]!;
}

/** How much likelier skeptics and filming crews are while the skeptic society lays siege. */
export const SIEGE_WEIGHT = 4;

/** The kind of the next group through the gate, weighted, from the kinds the park's rumor has drawn. */
export function pickVisitorKind(rumor: number, roll: number, siege = false): VisitorKind {
  const open = VISITORS.filter((kind) => rumor >= kind.rumor);
  // Under siege the skeptic society packs the gate, cameras in hand.
  const weight = (kind: VisitorKind) => kind.weight * (siege && (kind.skeptic === true || kind.films !== undefined) ? SIEGE_WEIGHT : 1);
  const total = open.reduce((sum, kind) => sum + weight(kind), 0);
  let left = roll * total;
  for (const kind of open) {
    left -= weight(kind);
    if (left < 0) return kind;
  }
  return open[open.length - 1]!;
}

/** How many come in a group of this kind, from a roll in [0, 1). */
export function groupSize(kind: VisitorKind, roll: number): number {
  const [low, high] = kind.group;
  return low + Math.min(high - low, Math.floor(roll * (high - low + 1)));
}

/** A visitor's starting nerve, from a roll in [0, 1). */
export function startingCourage(kind: VisitorKind, roll: number): number {
  const [low, high] = kind.courage;
  return low + (high - low) * roll;
}
