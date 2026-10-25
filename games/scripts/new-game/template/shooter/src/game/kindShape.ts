/**
 * The shooter kind's part of `idea.ts`: the guns you carry and buy, who holds the outposts, what
 * clearing them pays, and the upgrades cash buys. The shared part (name, look, ground, sky) is in
 * `ideaShape.ts`.
 */
import type { BaseIdea, BeatWord, ModelRef } from "./ideaShape";

/** A gun: hitscan through the engine's projectile system, with a magazine and a fire rate. */
export interface GunWord {
  id: string;
  label: string;
  /** Damage per pellet at level 1. */
  damage: number;
  /** Metres a shot reaches. */
  range: number;
  /** Cone half-angle in degrees. */
  spread: number;
  /** Pellets per shot (a shotgun fires several). */
  pellets: number;
  /** Rounds per minute. */
  rpm: number;
  /** Holding the trigger keeps firing. */
  auto: boolean;
  mag: number;
  reloadMs: number;
  /** Cash to unlock; 0 is the gun you start with. */
  price: number;
}

/** Someone who holds an outpost and shoots back. */
export interface EnemyWord {
  id: string;
  label: string;
  model: ModelRef;
  health: number;
  /** Damage per shot. */
  damage: number;
  /** Metres they shoot from. */
  range: number;
  /** Seconds between their shots. */
  every: number;
  /** Cone half-angle in degrees: how often they miss. */
  spread: number;
  speed: number;
  /** Cash paid for the kill. */
  bounty: number;
}

/** A camp to clear: who is in it and what it pays when the last of them falls. */
export interface OutpostWord {
  id: string;
  label: string;
  /** Enemy ids, one per guard. */
  garrison: readonly string[];
  pay: number;
}

/** Something cash improves, one stage at a time. */
export interface UpgradeWord {
  id: string;
  label: string;
  /** `armor` adds health; `damage` makes every gun hit harder. */
  stat: "armor" | "damage";
  /** Added per stage, as a share (0.25 = +25%). */
  step: number;
  /** Cash for the next stage, times the stage you are on. */
  price: number;
  stages: number;
}

export interface Idea extends BaseIdea {
  kind: "shooter";
  hero: ModelRef & { health: number; label: string };
  /** Where you start and respawn. */
  base: { label: string; model: ModelRef };
  /** The side holding the outposts ("the Hive", "Blackline"). */
  foe: string;
  currency: { id: string; label: string; start: number };
  guns: readonly GunWord[];
  enemies: readonly EnemyWord[];
  outposts: readonly OutpostWord[];
  upgrades: readonly UpgradeWord[];
  beats: readonly BeatWord[];
  /** Cover piled around every outpost (crates, barriers, containers). */
  cover: readonly ModelRef[];
  /** Props piled in clusters around the base and in the wilds. */
  scenery: readonly ModelRef[];
}
