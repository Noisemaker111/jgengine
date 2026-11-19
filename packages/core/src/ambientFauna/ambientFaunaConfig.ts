import type { ModelConfig } from "../game/playableGame";
import type { FaunaGroup, FaunaWorld } from "./ambientFauna";

export interface FaunaSpecies {
  model?: string | ModelConfig;
  /** A small tinted solid for distance, and for motes that never need a model. `length` stretches it along the heading. */
  sprite?: { color: string; size: number; length?: number; glow?: boolean };
  forward?: readonly [number, number, number];
  scale?: number;
}

export interface AmbientFaunaConfig {
  species: Readonly<Record<string, FaunaSpecies>>;
  groups?: readonly FaunaGroup[];
  surface?: number | ((x: number, z: number, time: number) => number);
  /** Wind for soarers and drift: a `windField(...)` fits. */
  wind?: FaunaWorld["wind"];
  /** True where a plant or grass grows, given the ground height there, for swarms and drift. Default everywhere. */
  plantAt?: (x: number, z: number, groundY: number) => boolean;
  globalCap?: number;
  drawCap?: number;
  simulateRange?: number;
}
