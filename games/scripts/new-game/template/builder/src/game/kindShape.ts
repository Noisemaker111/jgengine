/**
 * The builder kind's part of `idea.ts`: what the realm stores, what can be built and what each
 * building houses, employs or makes, the tiers the settlement climbs and the crowning build that ends
 * the story. The shared part (name, look, ground, sky) is in `ideaShape.ts`.
 */
import type { BaseIdea, BeatWord, ModelRef } from "./ideaShape";

export interface ResourceWord {
  id: string;
  label: string;
  start: number;
}

/** One rung of the settlement: a hamlet becomes a town once enough people live there. */
export interface TierWord {
  label: string;
  /** People needed to reach this tier (0 for the first). */
  people: number;
  /** One line said when it is reached. */
  note: string;
}

/** Something placed on the realm's grid. */
export interface BuildingWord {
  id: string;
  label: string;
  /** `home` houses people, `producer` employs them and makes a resource, `crown` ends the story. */
  role: "home" | "producer" | "crown";
  key: string;
  /** Tier (1-based) the building unlocks at. */
  tier: number;
  cost: Readonly<Record<string, number>>;
  /** Footprint in grid cells. */
  size: readonly [number, number];
  /** Seconds to build. */
  takes: number;
  /** home: people housed per level. */
  houses?: number;
  /** producer: people it employs. */
  staff?: number;
  /** producer: the resource it makes, and units per second at level 1. */
  makes?: string;
  rate?: number;
  blurb: string;
  model: ModelRef;
}

export interface Idea extends BaseIdea {
  kind: "builder";
  /** The seat the realm starts from: a hall, a town hall, a command dome. */
  seat: { label: string; model: ModelRef; houses: number; size: readonly [number, number] };
  /** What one person is called, and who walks the streets. */
  people: { label: string; walkers: readonly ModelRef[] };
  resources: readonly ResourceWord[];
  buildings: readonly BuildingWord[];
  tiers: readonly TierWord[];
  /** Food eaten per person per second (the first resource is food). */
  eats: number;
  /** Coin per person per second, from taxes, into the resource `coin` names. */
  tax: number;
  coin: string;
  beats: readonly BeatWord[];
  /** Props piled in clusters at the edge of the build ground. */
  scenery: readonly ModelRef[];
  /** Grid size in cells and metres per cell. */
  grid: { cells: number; cell: number };
}
