/**
 * The farm kind's part of `idea.ts`: what grows, what bites, what the market sells and who lives in
 * the village. The shared part (name, look, ground, sky) is in `ideaShape.ts`.
 */
import type { BaseIdea, BeatWord, ModelRef } from "./ideaShape";

/** Something planted in a plot: bought as seed, grown over in-world hours, harvested and sold. */
export interface CropWord {
  id: string;
  label: string;
  /** Coins for one plot's seed. */
  seed: number;
  /** In-world hours from planting to ripe; a night's sleep covers most of a day. */
  hours: number;
  /** Coins each one sells for. */
  price: number;
  /** How many one plot gives. */
  yield: number;
  /** Coins to unlock the seed at the market; 0 means you start with it. */
  unlock: number;
  /** What the plot shows while it grows, and once it is ripe. */
  sprout: ModelRef;
  ripe: ModelRef;
}

/** Something that bites at the water. */
export interface FishWord {
  id: string;
  label: string;
  price: number;
  /** How often it bites relative to the others. */
  weight: number;
  /** Casts you must land first before it shows up. */
  after: number;
  /** How fast the green zone slides on its bite (0 holds still). */
  drift: number;
}

/** A market upgrade with stages: each stage costs `cost` times the stage. */
export interface UpgradeWord {
  id: "rod" | "land";
  label: string;
  /** What one stage does, in words the store shows. */
  does: string;
  cost: number;
  /** Stages you can buy. */
  levels: number;
}

/** Someone in the village: walks the square, says their line, and some give you requests. */
export interface VillagerWord {
  id: string;
  name: string;
  title: string;
  /** What they say when you talk to them. */
  line: string;
  model: ModelRef;
}

export interface Idea extends BaseIdea {
  kind: "farm";
  currency: { id: string; label: string; start: number };
  hero: ModelRef & { label: string };
  /** The cottage you sleep in; the day ends and saves there. */
  home: { label: string; model: ModelRef };
  /** Where you sell what you grow and catch, by the cottage. */
  stall: { label: string; model: ModelRef };
  /** The village store: seeds, rods and land. */
  market: { label: string; town: string; model: ModelRef; opens: number; closes: number };
  /** The water you fish in. */
  water: { label: string; spot: string };
  crops: readonly CropWord[];
  fish: readonly FishWord[];
  upgrades: readonly UpgradeWord[];
  /** Plots ready to plant on day one, and how many the land holds in all. */
  plots: { start: number; total: number; perRow: number };
  villagers: readonly VillagerWord[];
  /** Animals that wander the farm. */
  animals: readonly ModelRef[];
  beats: readonly BeatWord[];
  /** Props piled around the farm, the shore and the market (fences, crates, carts). */
  scenery: readonly ModelRef[];
}
