/**
 * The explorer kind's part of `idea.ts`: the places worth walking to, the relics found there and what
 * each one lets you do, the guardians that keep them, and the goal at the end of the road. The shared
 * part (name, look, ground, sky) is in `ideaShape.ts`.
 */
import type { BaseIdea, BeatWord, ModelRef } from "./ideaShape";

/** What a relic lets you do once you carry it. */
export type Ability = "glide" | "doubleJump" | "stamina" | "swift";

/** Creatures that stand watch at a landmark; the relic there can't be taken while one is up. */
export interface GuardianWord {
  id: string;
  label: string;
  model: ModelRef;
  health: number;
  damage: number;
  speed: number;
  count: number;
}

export interface RelicWord {
  id: string;
  label: string;
  grants: Ability;
  /** One line said when you pick it up: what it does and how to use it. */
  blurb: string;
  model: ModelRef;
}

/**
 * A place on the map: discovering it adds it to the fast-travel network. `relic` places hold a relic,
 * `vista` places are only somewhere to see and travel to, the `final` place holds the goal.
 */
export interface LandmarkWord {
  id: string;
  label: string;
  role: "relic" | "vista" | "final";
  /** The big model you see from far off. */
  centerpiece: ModelRef;
  /** Broken pieces piled around it. */
  ruins: readonly ModelRef[];
  relic?: RelicWord;
  guardian?: GuardianWord;
}

export interface Idea extends BaseIdea {
  kind: "explorer";
  hero: ModelRef & { health: number; damage: number; stamina: number; label: string };
  /** In journey order: the first is a short walk from the start, the last is the goal. */
  landmarks: readonly LandmarkWord[];
  /** The goal at the final landmark: what you do there once every relic is yours. */
  goal: { label: string; verb: string; done: string; model: ModelRef };
  /** What stands on each relic's shrine. */
  pedestal: ModelRef;
  beats: readonly BeatWord[];
  /** Props for the start camp and the roadside. */
  scenery: readonly ModelRef[];
}
