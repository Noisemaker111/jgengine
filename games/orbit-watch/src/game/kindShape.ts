/**
 * The defense kind's part of `idea.ts`: the core to hold, the towers that go on the pads along the
 * lanes, what marches down them wave after wave and what each kill pays. The shared part (name,
 * look, ground, sky) is in `ideaShape.ts`.
 */
import type { BaseIdea, BeatWord, ModelRef } from "./ideaShape";

/** Something built on a pad beside a lane. */
export interface TowerWord {
  id: string;
  label: string;
  /** Coin to build it; an upgrade costs three quarters of this, times its level. */
  cost: number;
  /** Damage per shot at level 1 (each level adds 60%). */
  damage: number;
  /** Metres it reaches at level 1 (each level adds 10%). */
  range: number;
  /** Shots a second. */
  rate: number;
  /** Metres a shot also hits around its target (half damage); 0 for a single target. */
  splash: number;
  /** What a hit leaves a target moving at for a moment (0.5 is half speed); 1 for no slow. */
  slow: number;
  /** The shot's look: a vfx preset (`arrow`, `laser`, `fireball`, `lightning`...). */
  shot: string;
  /** The wave it unlocks on (1 for from the start). */
  from: number;
  blurb: string;
  model: ModelRef;
}

/** Something that marches down a lane. */
export interface CreepWord {
  id: string;
  label: string;
  health: number;
  /** Metres a second. */
  speed: number;
  /** Coin a kill pays. */
  bounty: number;
  /** Lives lost when it reaches the core. */
  leak: number;
  /** First wave it marches in. */
  from: number;
  /** A boss closes every fifth wave. */
  boss?: boolean;
  model: ModelRef;
}

export interface Idea extends BaseIdea {
  kind: "defense";
  /** What is being held: it stands where every lane ends. */
  core: { label: string; model: ModelRef; lives: number };
  coin: { label: string; start: number };
  /** What the attackers are called together: "Raiders", "The swarm". */
  foe: string;
  /** The word for one wave: "Wave", "Assault". */
  wave: string;
  /** Waves to hold for the win. */
  waves: number;
  /** Seconds of calm before the first wave, and between the rest. */
  calm: { first: number; between: number };
  towers: readonly TowerWord[];
  creeps: readonly CreepWord[];
  /** The slab every tower pad is drawn with. */
  pad: ModelRef;
  beats: readonly BeatWord[];
  /** Props piled at the lane mouths and round the core. */
  scenery: readonly ModelRef[];
}
