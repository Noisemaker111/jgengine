import type { FightIntent } from "@jgengine/core/ai/director/roles";
import type { SquadRole } from "@jgengine/core/combat/squadTactics";

/**
 * How each crew fights. A duty says *what* a fighter does; these roles say *how this crew does it*,
 * which is why the same "cover" order puts a Scrapjack behind a crate at 14 m and a Ripper at the
 * player's shoulder.
 */
export type Faction = "scrapjack" | "ripper";

const SCAVJACK: Record<FightIntent, SquadRole> = {
  assault: {
    id: "press",
    preferredRange: 9,
    discipline: { holdSeconds: 1.1, peekSeconds: 0.9, fireInterval: 0.85 },
  },
  cover: {
    id: "dig-in",
    preferredRange: 14,
    holdCover: true,
    discipline: { holdSeconds: 2.2, peekSeconds: 0.7, fireInterval: 1.1 },
    cover: { hidden: 4, range: 1.2, flank: 0.4, near: 0.8, crowding: 2.4 },
  },
  hold: {
    id: "anchor",
    preferredRange: 15,
    holdCover: true,
    discipline: { holdSeconds: 2.6, peekSeconds: 0.6, fireInterval: 1.2 },
    cover: { hidden: 4.5, range: 1.4, flank: 0.2, near: 1, crowding: 2 },
  },
  flank: {
    id: "shoulder",
    preferredRange: 12,
    flankAngle: 0.9,
    discipline: { holdSeconds: 1.4, peekSeconds: 0.8, fireInterval: 0.95 },
    cover: { hidden: 3, range: 1, flank: 1.8, near: 0.4, crowding: 2 },
  },
  retreat: {
    id: "fall-back",
    preferredRange: 17,
    retreatBelow: 0.25,
    cover: { hidden: 4, range: 0.6, flank: 0.2, near: 0.4, crowding: 1, retreat: 2.4 },
  },
};

const RIPPER: Record<FightIntent, SquadRole> = {
  assault: { id: "lunge", preferredRange: 1.7 },
  cover: {
    id: "stalk",
    preferredRange: 3.6,
    discipline: { holdSeconds: 0.5, peekSeconds: 0.4, fireInterval: 0.7 },
    cover: { hidden: 1.2, range: 0.8, flank: 2.2, near: 0.9, crowding: 1.6 },
  },
  hold: { id: "root", preferredRange: 2.2, holdCover: true },
  flank: {
    id: "circle",
    preferredRange: 2.4,
    flankAngle: 1.5,
    cover: { hidden: 0.8, range: 0.6, flank: 3, near: 0.3, crowding: 1.2 },
  },
  retreat: { id: "slink", preferredRange: 5, retreatBelow: 0.25 },
};

const TABLES: Record<Faction, Record<FightIntent, SquadRole>> = {
  scrapjack: SCAVJACK,
  ripper: RIPPER,
};

/** The role one crew gives a duty. This is the `roleFor` `compositionForIntents` reads. */
export function roleFor(faction: Faction): (intent: FightIntent) => SquadRole {
  return (intent) => TABLES[faction][intent];
}

/** The dials only, for a test or a probe. */
export function factionRole(faction: Faction, intent: FightIntent): SquadRole {
  return TABLES[faction][intent];
}
