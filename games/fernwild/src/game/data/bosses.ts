import type { PhaseLike } from "@jgengine/core/ai/phaseLadder";
import type { Predicate } from "@jgengine/core/rules/predicate";
import type { SummonTier } from "../../engine-local/summonedEncounter/summonedEncounter";

export interface BroodTier extends SummonTier {
  id: "gamma" | "beta" | "alpha";
  label: string;
  minLevel: number;
  cost: Readonly<Record<string, number>>;
  requirement: Predicate;
  species: string;
  rewards: Readonly<Record<string, number>>;
}

const ARTIFACTS = { artifact_clever: 1, artifact_hunter: 1, artifact_massive: 1 } as const;
const trophies = (each: number) => ({ argentavis_talon: each, sarcosuchus_skin: each, sauropod_vertebra: each, titanoboa_venom: each });
const levelAtLeast = (level: number): Predicate => ({ gte: ["level", level] });

export const BROOD_TIERS: readonly BroodTier[] = [
  { id: "gamma", at: 0, label: "Gamma", minLevel: 30, cost: { ...ARTIFACTS }, requirement: levelAtLeast(30), species: "broodmother_gamma", rewards: { element: 20, spider_flag: 1, broodmother_trophy_gamma: 1 } },
  { id: "beta", at: 1, label: "Beta", minLevel: 50, cost: { ...ARTIFACTS, ...trophies(5) }, requirement: levelAtLeast(50), species: "broodmother_beta", rewards: { element: 56, spider_flag: 1, broodmother_trophy_beta: 1 } },
  { id: "alpha", at: 2, label: "Alpha", minLevel: 70, cost: { ...ARTIFACTS, ...trophies(10) }, requirement: levelAtLeast(70), species: "broodmother_alpha", rewards: { element: 148, spider_flag: 1, broodmother_trophy_alpha: 1 } },
];

export function broodTier(id: string): BroodTier | null {
  return BROOD_TIERS.find((tier) => tier.id === id) ?? null;
}

export const BROOD_LAIR = {
  center: [1500, 1500] as const,
  /** Open floor inside the wall, metres. */
  radius: 40,
  floor: 4,
  wallHeight: 28,
};

export const PORTAL_RANGE = 30;
export const DRAG_WEIGHT = 560;
export const BROOD_CAPS = { survivor: 10, companion: 20 } as const;
/** Seconds the portal counts down, and seconds the winners stay in her lair. */
export const BROOD_CLOCK = { portalSeconds: 25, victorySeconds: 60 } as const;

export interface BroodPhase extends PhaseLike {
  brood: number;
  /** Seconds between her web-and-acid spits. */
  spitEvery: number;
}

export const BROOD_PHASES: readonly BroodPhase[] = [
  { id: "hunt", at: 1, brood: 4, spitEvery: 12 },
  { id: "brood", at: 0.66, tell: { id: "The Broodmother calls her brood", seconds: 3 }, brood: 6, spitEvery: 9 },
  { id: "frenzy", at: 0.33, tell: { id: "The Broodmother is enraged", seconds: 3 }, brood: 8, spitEvery: 6 },
];

export const SPIT = { range: 80, damage: 40, torpor: 15, webSeconds: 6, webSlow: 0.4 };

export const TROPHY_DROPS: Readonly<Record<string, string>> = {
  argentavis: "argentavis_talon",
  sarco: "sarcosuchus_skin",
  brontosaurus: "sauropod_vertebra",
  diplodocus: "sauropod_vertebra",
  titanoboa: "titanoboa_venom",
};
