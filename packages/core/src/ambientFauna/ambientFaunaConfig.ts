import type { ModelConfig } from "../game/playableGame";
import type { FaunaGroup, FaunaWorld } from "./ambientFauna";

/** How one species looks: a model up close, a sprite far off, or the sprite alone. */
export interface FaunaSpecies {
  /** Catalog id or model config drawn within a group's `lod.near`. Without it the sprite is drawn at every range. */
  model?: string | ModelConfig;
  /** A small tinted solid for distance, and for motes that never need a model. `length` stretches it along the heading. */
  sprite?: { color: string; size: number; length?: number; glow?: boolean };
  /** The model's nose axis. Default -Z. */
  forward?: readonly [number, number, number];
  /** Extra scale on top of the model's own. Default 1. */
  scale?: number;
}

/** Turn ambient fauna on: the species table plus how groups see the world. */
export interface AmbientFaunaConfig {
  /** Every species a group may name. */
  species: Readonly<Record<string, FaunaSpecies>>;
  /** Groups declared in code; `ambient_fauna` zones in the editor scene add to them. */
  groups?: readonly FaunaGroup[];
  /** Water surface height, or a function of point and time. Default 0. */
  surface?: number | ((x: number, z: number, time: number) => number);
  /** Wind for soarers and drift: a `windField(...)` fits. */
  wind?: FaunaWorld["wind"];
  /** True where a plant or grass grows, given the ground height there, for swarms and drift. Default everywhere. */
  plantAt?: (x: number, z: number, groundY: number) => boolean;
  /** Most agents simulated across every group. Default 2000; the low tier halves it. */
  globalCap?: number;
  /** Most agents drawn per frame across every group. Default 1200. */
  drawCap?: number;
  /** Groups farther from the camera than this are not simulated. Default 400. */
  simulateRange?: number;
}
