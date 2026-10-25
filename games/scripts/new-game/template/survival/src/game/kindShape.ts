/**
 * The survival kind's part of `idea.ts`: what you gather, what you build, what comes at night, who you
 * can tame. The shared part (name, look, ground, sky) is in `ideaShape.ts`.
 */
import type { BaseIdea, BeatWord, ModelRef } from "./ideaShape";

export interface ResourceWord {
  id: string;
  label: string;
  start: number;
}

/** Something in the world the player works for a resource (search a crate, chop a tree). */
export interface NodeWord {
  id: string;
  label: string;
  verb: string;
  gives: string;
  amount: number;
  /** Uses before it is spent; it refills at `regrow` per second. */
  uses: number;
  regrow: number;
  prop: ModelRef;
}

/** Something the player builds on the camp grid. */
export interface StructureWord {
  id: string;
  label: string;
  /** `wall` soaks damage, `turret` shoots threats in range, `producer` adds a resource over time. */
  role: "wall" | "turret" | "producer";
  key: string;
  cost: Readonly<Record<string, number>>;
  takes: number;
  health: number;
  /** turret: damage per shot at level 1; producer: units per second at level 1. */
  power: number;
  /** producer: the resource it makes. */
  makes?: string;
  prop: ModelRef;
}

/** Something that comes for the camp when the wave starts. */
export interface ThreatWord {
  id: string;
  label: string;
  model: ModelRef;
  health: number;
  damage: number;
  speed: number;
  /** First wave it shows up in. */
  from: number;
}

/** A creature the player can win over; it follows and fights threats. */
export interface AllyWord {
  id: string;
  label: string;
  verb: string;
  model: ModelRef;
  cost: Readonly<Record<string, number>>;
  health: number;
  damage: number;
  speed: number;
}

export interface Idea extends BaseIdea {
  kind: "survival";
  home: { label: string; health: number; model: ModelRef };
  /** What one wave is called ("Night", "Hunt", "Raid"). */
  wave: string;
  /** Seconds of calm between waves; a day lasts twice this, so each wave lands at dusk. */
  calm: number;
  hero: ModelRef & { health: number; damage: number; label: string };
  resources: readonly ResourceWord[];
  nodes: readonly NodeWord[];
  structures: readonly StructureWord[];
  threats: readonly ThreatWord[];
  allies: readonly AllyWord[];
  beats: readonly BeatWord[];
  /** Props piled in clusters around the camp and the wilds (ruins, wrecks, crates). */
  scenery: readonly ModelRef[];
  /** Waves to hold for the ending; play goes on after it. */
  winAt: number;
}
