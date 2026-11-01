import type { PhaseLike } from "@jgengine/core/ai/phaseLadder";
import type { Predicate } from "@jgengine/core/rules/predicate";
import type { SummonTier } from "@jgengine/core/summonedEncounter/summonedEncounter";

/** One of the Broodmother's difficulties: what summoning her costs, what she is, and what beating her gives. */
export interface BroodTier extends SummonTier {
  id: "gamma" | "beta" | "alpha";
  label: string;
  /** Survivor level the summoner needs. */
  minLevel: number;
  /** Item id → count the summon takes from the survivor. */
  cost: Readonly<Record<string, number>>;
  /** The level half of the summon's requirement. */
  requirement: Predicate;
  /** The species she spawns as. */
  species: string;
  /** Item id → count every survivor in the arena gets when she dies. */
  rewards: Readonly<Record<string, number>>;
}

const ARTIFACTS = { artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 } as const;
const trophies = (each: number) => ({ argentavis_talon: each, sarcosuchus_skin: each, sauropod_vertebra: each, titanoboa_venom: each });
const levelAtLeast = (level: number): Predicate => ({ gte: ["level", level] });

/**
 * The Broodmother Lysrix at the Green Obelisk (ARK wiki, The Island): the survivor level each difficulty asks, its
 * cost (the Clever, Hunter and Massive artifacts, plus five or ten of each of four trophies past Gamma), and what
 * each survivor takes home: Element, a Spider Flag and her trophy.
 */
export const BROOD_TIERS: readonly BroodTier[] = [
  { id: "gamma", at: 0, label: "Gamma", minLevel: 30, cost: { ...ARTIFACTS }, requirement: levelAtLeast(30), species: "broodmother_gamma", rewards: { element: 20, spider_flag: 1, broodmother_trophy_gamma: 1 } },
  { id: "beta", at: 1, label: "Beta", minLevel: 50, cost: { ...ARTIFACTS, ...trophies(5) }, requirement: levelAtLeast(50), species: "broodmother_beta", rewards: { element: 56, spider_flag: 1, broodmother_trophy_beta: 1 } },
  { id: "alpha", at: 2, label: "Alpha", minLevel: 70, cost: { ...ARTIFACTS, ...trophies(10) }, requirement: levelAtLeast(70), species: "broodmother_alpha", rewards: { element: 148, spider_flag: 1, broodmother_trophy_alpha: 1 } },
];

export function broodTier(id: string): BroodTier | null {
  return BROOD_TIERS.find((tier) => tier.id === id) ?? null;
}

/**
 * Her lair: ARK sends the fight to a jungle arena of its own. Here it is a walled islet raised from the sea in the
 * map's far south-east corner, out of sight of the Island, where only the obelisk's portal leads. Approximate size.
 */
export const BROOD_LAIR = {
  center: [1500, 1500] as const,
  /** Open floor inside the wall, metres. */
  radius: 40,
  /** Floor height above the sea. */
  floor: 4,
  wallHeight: 28,
};

/** How far from the obelisk the portal takes survivors and their tames (ARK: the obelisk's platform). */
export const PORTAL_RANGE = 30;
/** ARK lets nothing heavier than its drag weight through the portal. */
export const DRAG_WEIGHT = 560;
/** Survivors, and companions, one fight admits. */
export const BROOD_CAPS = { survivor: 10, companion: 20 } as const;
/** Seconds the portal counts down, and seconds the winners stay in her lair. */
export const BROOD_CLOCK = { portalSeconds: 25, victorySeconds: 60 } as const;

/**
 * Her phases: she calls Araneo out of the walls as she weakens, and spits and webs faster. The wiki names the
 * Araneo, the web that slows and the acid; how many come and when, and the spit's timing, are approximate.
 */
export interface BroodPhase extends PhaseLike {
  /** Araneo that crawl out when this phase starts. */
  brood: number;
  /** Seconds between her web-and-acid spits. */
  spitEvery: number;
}

export const BROOD_PHASES: readonly BroodPhase[] = [
  { id: "hunt", at: 1, brood: 4, spitEvery: 12 },
  { id: "brood", at: 0.66, tell: { id: "The Broodmother calls her brood", seconds: 3 }, brood: 6, spitEvery: 9 },
  { id: "frenzy", at: 0.33, tell: { id: "The Broodmother is enraged", seconds: 3 }, brood: 8, spitEvery: 6 },
];

/** Her spit: how far it reaches (across her whole lair), the acid's damage and torpor, and how long and how hard the web slows. Approximate. */
export const SPIT = { range: 80, damage: 40, torpor: 15, webSeconds: 6, webSlow: 0.4 };

/** Trophies the tribute asks for, and the creatures whose bodies they are found in (one each, approximate odds). */
export const TROPHY_DROPS: Readonly<Record<string, string>> = {
  argentavis: "argentavis_talon",
  sarco: "sarcosuchus_skin",
  brontosaurus: "sauropod_vertebra",
  diplodocus: "sauropod_vertebra",
  titanoboa: "titanoboa_venom",
};
