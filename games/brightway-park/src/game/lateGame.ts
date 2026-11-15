import { GHOSTS } from "./ghostCatalog";

/**
 * Where a rich haunt's ectoplasm goes, as data: empowering its residents, binding pairs of them to
 * haunt together, buying the manor and the crypt beyond the fence, and the rituals. The world
 * declaration (`park.ts`) turns each into an action; `ghosts.ts`, `threats.ts` and the guests read
 * what they set.
 */

/** What empowering a resident to each level costs: a resident at level n seeps `EMPOWER_YIELD` x n more and haunts harder. */
export const EMPOWER_COSTS: readonly number[] = [3_000, 8_000, 20_000];
export const EMPOWER_YIELD = 0.6;
/** Fright each level adds to a resident's haunt. */
export const EMPOWER_FRIGHT = 2;

export interface BondDef {
  id: string;
  label: string;
  blurb: string;
  a: string;
  b: string;
  cost: number;
}

/** Pairs of residents a ritual binds to haunt together: while both are home they flare as one and seep more. */
export const BONDS: readonly BondDef[] = [
  { id: "sea", label: "The Light and the Wreck", a: "sailor", b: "keeper", cost: 12_000, blurb: "The keeper finally guides the Mary Ellen home, every night." },
  { id: "wedding", label: "The Wedding That Never Was", a: "child", b: "bride", cost: 15_000, blurb: "A flower girl at last for the bride on the wheel." },
  { id: "racket", label: "The Racket", a: "poltergeist", b: "banshee", cost: 18_000, blurb: "Smashing crockery to her wail, in time." },
];
/** What an active bond adds: a share of both residents' seep, and rumor. */
export const BOND_YIELD = 0.5;
export const BOND_RUMOR = 30;

export const bondFact = (id: string): string => `bond.${id}`;
export const bondActiveFact = (id: string): string => `bond.${id}.active`;

export interface ExpansionDef {
  id: string;
  label: string;
  blurb: string;
  cost: number;
  /** The living the park can hold at once on top of what the rumor allows. */
  crowd: number;
  /** Rumor it adds while it stands. */
  rumor: number;
  after?: string;
}

/** Grounds beyond the fence the haunt can buy: each holds more of the living and spreads the rumor. */
export const EXPANSIONS: readonly ExpansionDef[] = [
  { id: "manor", label: "The Hollow Manor", cost: 25_000, crowd: 40, rumor: 40, blurb: "The derelict house on the cliff above the pier, its lights on again. The living queue round the block." },
  { id: "crypt", label: "The Crypt Beneath", cost: 60_000, crowd: 60, rumor: 60, after: "manor", blurb: "The catacombs under the manor, opened to the brave. Nobody comes up the same way they went down." },
];
export const expansionFact = (id: string): string => `park.${id}`;

/** The living the bought grounds hold on top of what the rumor allows. */
export function expansionCrowd(w: { num(fact: string): number }): number {
  return EXPANSIONS.reduce((sum, expansion) => sum + (w.num(expansionFact(expansion.id)) >= 1 ? expansion.crowd : 0), 0);
}

/** The rumor the grounds and the live bonds add. */
export function lateRumor(w: { num(fact: string): number }): number {
  const grounds = EXPANSIONS.reduce((sum, expansion) => sum + (w.num(expansionFact(expansion.id)) >= 1 ? expansion.rumor : 0), 0);
  return grounds + BONDS.reduce((sum, bond) => sum + (w.num(bondActiveFact(bond.id)) >= 1 ? BOND_RUMOR : 0), 0);
}

export interface RitualDef {
  id: string;
  label: string;
  blurb: string;
  cost: number;
}

/** The rituals: costly, and each the answer to one trouble. */
export const RITUALS: readonly RitualDef[] = [
  { id: "ritual_silence", label: "Ritual of Silence", cost: 4_000, blurb: "Every camera in town fogs over: 60 evidence wiped from the record." },
  { id: "ritual_bloodmoon", label: "Blood Moon", cost: 9_000, blurb: "Tonight every scare wrings out half as much ectoplasm again." },
  { id: "ritual_summon", label: "The Summoning", cost: 7_000, blurb: "Calls every ghost that has found what it wants straight into the park, no waiting." },
];
export const BLOOD_MOON_HARVEST = 1.5;

/** Every resident's id, for the per-ghost empower actions. */
export const GHOST_IDS: readonly string[] = GHOSTS.map((ghost) => ghost.id);
export const ghostLevelFact = (id: string): string => `ghost.${id}.level`;
export const ghostPowerFact = (id: string): string => `ghost.${id}.power`;
