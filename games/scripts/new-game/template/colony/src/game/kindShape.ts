/**
 * The colony kind's part of `idea.ts`: the colonists you command, what they gather and from what,
 * what they build on the grid round the headquarters, who raids them and how often, and the build
 * that wins. The shared part (name, look, ground, sky) is in `ideaShape.ts`.
 */
import type { BaseIdea, BeatWord, ModelRef } from "./ideaShape";

export interface ResourceWord {
  id: string;
  label: string;
  start: number;
}

/** Something colonists gather from: a tree, an ore vein, a berry thicket. */
export interface NodeWord {
  id: string;
  label: string;
  resource: string;
  /** Units one trip carries back. */
  carry: number;
  /** Seconds of work per trip. */
  work: number;
  model: ModelRef;
}

/** Something built on the grid round the headquarters. */
export interface StructureWord {
  id: string;
  label: string;
  /** `house` adds beds, `store` is a drop-off point, `farm` grows food, `tower` shoots raiders, `crown` wins. */
  role: "house" | "store" | "farm" | "tower" | "crown";
  cost: Readonly<Record<string, number>>;
  /** Footprint in grid cells. */
  size: readonly [number, number];
  /** Seconds to build. */
  takes: number;
  /** house: colonists it sleeps. */
  beds?: number;
  /** farm: food a second. */
  rate?: number;
  /** tower: damage a shot (one a second) and reach in metres. */
  damage?: number;
  range?: number;
  /** tower: the shot's look, a vfx preset (`arrow`, `laser`...). */
  shot?: string;
  blurb: string;
  model: ModelRef;
}

/** One kind of raider. */
export interface RaiderWord {
  id: string;
  label: string;
  health: number;
  speed: number;
  damage: number;
  /** First raid it comes on. */
  from: number;
  model: ModelRef;
}

export interface Idea extends BaseIdea {
  kind: "colony";
  /** Where the colony starts: it sleeps a few and is the first drop-off point. */
  hq: { label: string; model: ModelRef; beds: number; size: readonly [number, number] };
  colonists: { label: string; one: string; start: number; health: number; speed: number; damage: number; models: readonly ModelRef[] };
  resources: readonly ResourceWord[];
  nodes: readonly NodeWord[];
  structures: readonly StructureWord[];
  raiders: { label: string; first: number; every: number; kinds: readonly RaiderWord[] };
  /** Food each colonist eats a second (the first resource is food). */
  eats: number;
  /** Seconds between new arrivals while there is a free bed and food to spare. */
  arrive: number;
  beats: readonly BeatWord[];
  /** Props piled round the headquarters and the raid camps. */
  scenery: readonly ModelRef[];
  /** Build grid size in cells and metres per cell. */
  grid: { cells: number; cell: number };
}
