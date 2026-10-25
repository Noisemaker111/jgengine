/** The racer kind's part of `idea.ts`: the car, the rivals, the garage and the career. */
import type { BaseIdea, ModelRef } from "./ideaShape";

export interface Idea extends BaseIdea {
  kind: "racer";
  currency: { id: string; label: string; start: number };
  car: ModelRef;
  rivals: readonly ModelRef[];
  /** Upgrades bought in the garage, each with levels. */
  upgrades: readonly { id: string; label: string; cost: number; levels: number; boost: number }[];
  /** Races, run in order; each pays and unlocks the next. */
  races: readonly { id: string; title: string; laps: number; rivals: number; pay: number; pitch: string }[];
  /** Props piled trackside in clumps (barriers, cones, crates). */
  scenery: readonly ModelRef[];
  /** Lines both sides of the circuit (street lamps, cones, barriers). */
  trackside: ModelRef;
}
