import type { RuleDef } from "@jgengine/core/game/ruleSelection";
import type { MedalBoardConfig } from "@jgengine/core/progression/medalBoard";

import { levelDamageMult, levelHealthMult } from "../entities/enemies/catalog";
import { MAX_LEVEL } from "../progression/curves";

/**
 * Overdrive: the Rustflat Front run again with the wreck's signal pushed past the red line. Each tier
 * is the same four-wave fight against crews levelled past the reclaimer, carrying the tier's mutators,
 * on a clock the medal board grades. Borderlands' Mayhem levels, Diablo's Greater Rifts and Destiny's
 * Nightfall modifiers are the references: a ladder that keeps a finished character fighting.
 */
export const RIFT_TIER_COUNT = 20;

/** Seconds between a cleared wave and the next going out on its own; calling it early saves the rest. */
export const RIFT_INTERMISSION_SECONDS = 12;

export interface RiftMutatorEffect {
  /** Multiplier on every rift crew member's health. */
  health?: number;
  /** Multiplier on the damage a rift crew member deals. */
  damage?: number;
  /** Multiplier on a crew member's attack interval (below 1 attacks faster). */
  interval?: number;
  /** Multiplier on a crew member's walk speed. */
  speed?: number;
  /** The surface every crew member presents to the element chart. */
  surface?: "flesh" | "armor";
  /** Chance each non-boss arrival brings a twin. */
  twinChance?: number;
  /** A crew member bursts on death: radius in metres, damage as a share of its own max health. */
  burst?: { radius: number; share: number };
  /** Share of max health a crew member regenerates per second. */
  regen?: number;
  /** Multiplier on the reclaimer's shield recharge. */
  shieldRegen?: number;
  /** Multiplier on the rift's cash payout. */
  cash?: number;
  /** An extra elite arrives with each wave. */
  escort?: boolean;
}

export type RiftMutator = RuleDef<{ name: string; blurb: string; effect: RiftMutatorEffect; boon?: boolean }>;

export const RIFT_MUTATORS: readonly RiftMutator[] = [
  { id: "frenzied", tags: ["tempo"], payload: { name: "Frenzied", blurb: "Crews attack 30% faster.", effect: { interval: 0.7 } } },
  { id: "juggernaut", tags: ["bulk"], payload: { name: "Juggernauts", blurb: "Crews carry 50% more health but walk slower.", effect: { health: 1.5, speed: 0.85 } } },
  { id: "plated", tags: ["surface"], conflicts: ["surface"], payload: { name: "Plated Hulls", blurb: "Every crew is armour-plated: corrosive bites, fire sputters.", effect: { surface: "armor" } } },
  { id: "stripped", tags: ["surface"], conflicts: ["surface"], payload: { name: "Stripped to the Frame", blurb: "No plating left: fire tears through every crew.", effect: { surface: "flesh" } } },
  { id: "volatile", tags: ["death"], payload: { name: "Volatile Cores", blurb: "Crews burst when they drop. Don't finish them up close.", effect: { burst: { radius: 3.2, share: 0.18 } } } },
  { id: "swarm", tags: ["count"], payload: { name: "Swarm Signal", blurb: "Half the arrivals bring a twin.", effect: { twinChance: 0.5 } } },
  { id: "ion_storm", tags: ["player"], payload: { name: "Ion Storm", blurb: "Your shield recharges at half speed.", effect: { shieldRegen: 0.5 } } },
  { id: "self_repair", tags: ["bulk"], payload: { name: "Self-Repair", blurb: "Crews mend 3% of their health every second.", effect: { regen: 0.03 } } },
  { id: "escort", tags: ["count"], payload: { name: "Elite Escort", blurb: "An elite husk joins every wave.", effect: { escort: true } } },
  { id: "glass", tags: ["boon"], conflicts: ["boon"], payload: { name: "Glass Cannons", blurb: "Crews have 25% less health but hit 25% harder.", effect: { health: 0.75, damage: 1.25 }, boon: true } },
  { id: "bounty", tags: ["boon"], conflicts: ["boon"], payload: { name: "Bounty Signal", blurb: "Double cash, and the crews are 20% tougher for it.", effect: { cash: 2, health: 1.2 }, boon: true } },
];

export function mutatorById(id: string): RiftMutator | undefined {
  return RIFT_MUTATORS.find((mutator) => mutator.id === id);
}

/** How many mutators a tier carries: the first tier is the plain fight, then one, two and three. */
export function mutatorCountFor(tier: number): number {
  if (tier <= 1) return 0;
  if (tier <= 3) return 1;
  if (tier <= 7) return 2;
  return 3;
}

export interface RiftScaling {
  tier: number;
  /** Level the crews fight at: the reclaimer's own, plus the tier. */
  enemyLevel: number;
  health: number;
  damage: number;
  /** Item level a rift drop rolls at. */
  lootLevel: number;
  /** Rarity luck on every rift drop. */
  luck: number;
  cash: number;
  cores: number;
}

/**
 * The tier's numbers against a reclaimer of `playerLevel`. The crews fight at the reclaimer's level
 * plus the tier, so the ladder stays ahead of a levelled character; a flat per-tier bonus on top keeps
 * high tiers climbing even at the level cap. Loot runs up to five levels above the reclaimer.
 */
export function riftScaling(tier: number, playerLevel: number): RiftScaling {
  const t = Math.max(1, Math.min(RIFT_TIER_COUNT, Math.floor(tier)));
  const level = Math.max(1, Math.floor(playerLevel));
  // Two tiers per crew level: the ladder climbs on raw health and damage, so a tier is a wall
  // a better gun gets over, not a level gap no gun closes.
  const enemyLevel = level + Math.floor((t - 1) / 2);
  return {
    tier: t,
    enemyLevel,
    health: levelHealthMult(enemyLevel) * (1 + 0.06 * (t - 1)),
    damage: levelDamageMult(enemyLevel) * (1 + 0.03 * (t - 1)),
    lootLevel: Math.min(MAX_LEVEL + 5, level + Math.min(5, Math.floor((t - 1) / 2))),
    luck: 1 + 0.3 * t,
    cash: Math.round(150 * t * (1 + level / 10)),
    cores: 3 + 2 * t,
  };
}

/** Medal time targets for a tier: deeper tiers allow a little longer, because the crews last longer. */
export function medalTargets(tier: number): { bronze: number; silver: number; gold: number } {
  return { bronze: 900, silver: 150 + tier * 6, gold: 80 + tier * 4 };
}

export const MEDAL_REWARDS: Record<string, { cores: number; label: string }> = {
  bronze: { cores: 5, label: "Bronze" },
  silver: { cores: 10, label: "Silver" },
  gold: { cores: 20, label: "Gold" },
};

export function riftEventId(tier: number): string {
  return `overdrive_${tier}`;
}

export function riftTierId(tier: number): string {
  return `tier_${tier}`;
}

/**
 * The ladder as a medal board: one event per tier (clear time, lower is better), each in its own tier
 * group that opens at `tier - 1` medal points. Bronze is worth 1, so clearing every tier in order
 * opens the next; a gold is worth 3, so a clean clear lets a strong build skip ahead.
 */
export const RIFT_BOARD: MedalBoardConfig = {
  medals: [
    { id: "bronze", label: "Bronze", points: 1 },
    { id: "silver", label: "Silver", points: 2 },
    { id: "gold", label: "Gold", points: 3 },
  ],
  tiers: Array.from({ length: RIFT_TIER_COUNT }, (_, index) => ({
    id: riftTierId(index + 1),
    label: `Overdrive ${index + 1}`,
    requires: index,
  })),
  events: Array.from({ length: RIFT_TIER_COUNT }, (_, index) => ({
    id: riftEventId(index + 1),
    label: `Overdrive ${index + 1}`,
    tier: riftTierId(index + 1),
    direction: "lower" as const,
    targets: medalTargets(index + 1),
  })),
};

const ROMAN: readonly [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

export function romanTier(tier: number): string {
  let rest = Math.max(1, Math.floor(tier));
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}
