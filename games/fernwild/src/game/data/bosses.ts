import type { BossPhase } from "@jgengine/core/ai/director/boss";
import type { BossArenaTier } from "@jgengine/core/bossArena/bossArena";

/** One of the Broodmother's difficulties: what summoning her costs, what she is, and what beating her gives. */
export interface BroodTier extends BossArenaTier {
  id: "gamma" | "beta" | "alpha";
  label: string;
  /** The species she spawns as. */
  species: string;
  /** Item id → count every survivor in the arena gets when she dies. */
  rewards: Readonly<Record<string, number>>;
}

const ARTIFACTS = { artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 } as const;
const trophies = (each: number) => ({ argentavis_talon: each, sarcosuchus_skin: each, sauropod_vertebra: each, titanoboa_venom: each });

/**
 * The Broodmother Lysrix at the Green Obelisk (ARK wiki, The Island): the survivor level each difficulty asks, its
 * tribute (the Clever, Hunter and Massive artifacts, plus five or ten of each of four trophies past Gamma), and what
 * each survivor takes home: Element, a Spider Flag and her trophy.
 */
export const BROOD_TIERS: readonly BroodTier[] = [
  { id: "gamma", label: "Gamma", minLevel: 30, tribute: { ...ARTIFACTS }, species: "broodmother_gamma", rewards: { element: 20, spider_flag: 1, broodmother_trophy_gamma: 1 } },
  { id: "beta", label: "Beta", minLevel: 50, tribute: { ...ARTIFACTS, ...trophies(5) }, species: "broodmother_beta", rewards: { element: 56, spider_flag: 1, broodmother_trophy_beta: 1 } },
  { id: "alpha", label: "Alpha", minLevel: 70, tribute: { ...ARTIFACTS, ...trophies(10) }, species: "broodmother_alpha", rewards: { element: 148, spider_flag: 1, broodmother_trophy_alpha: 1 } },
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

/**
 * Her phases: she calls Araneo out of the walls as she weakens, and spits and webs faster. The wiki names the
 * Araneo, the web that slows and the acid; how many come and when, and the spit's timing, are approximate.
 */
export interface BroodPhase extends BossPhase {
  /** Araneo that crawl out when this phase starts. */
  brood: number;
  /** Seconds between her web-and-acid spits. */
  spitEvery: number;
}

export const BROOD_PHASES: readonly BroodPhase[] = [
  { id: "hunt", atHealth: 1, behaviour: {}, brood: 4, spitEvery: 12 },
  { id: "brood", atHealth: 0.66, behaviour: {}, tell: { id: "The Broodmother calls her brood", telegraphSeconds: 3 }, brood: 6, spitEvery: 9 },
  { id: "frenzy", atHealth: 0.33, behaviour: {}, tell: { id: "The Broodmother is enraged", telegraphSeconds: 3 }, brood: 8, spitEvery: 6 },
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
