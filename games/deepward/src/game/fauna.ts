import { decideTemperament, type TemperamentConfig, type TemperamentMode } from "@jgengine/core/ai/temperament";
import { createPerception, type PerceptionService } from "@jgengine/core/sensor/perception";
import { FAUNA, lineOfSight, type Point } from "../world";
import type { Stratum } from "./strata";

/**
 * Bellwether's other prints. Each species is a temperament (the engine's passive / territorial /
 * predator decision), a set of senses (the shared perception service, tuned per species) and a body:
 * health, speeds and a strike. The vault's Fitter keeps its own scripted routine; everything else
 * that lives down here is one of these.
 */
export type Species = "hand" | "courier" | "overrun";

export interface SpeciesDef {
  name: string;
  /** What the scanner's codex calls it, and what scanning it teaches. */
  codex: string;
  health: number;
  /** Metres a second idling or investigating, and when it commits (fleeing or charging). */
  walk: number;
  run: number;
  temperament: TemperamentConfig;
  senses: { sight: number; cone: number; hearing: number; scent: number; memory: number };
  /** Its strike: windup the diver can see coming, the reach it lands at and what it costs the suit. */
  strike: { damage: number; windup: number; reach: number; cooldown: number } | null;
  /** Body size for the model and the shot test, m. */
  size: number;
}

export const SPECIES: Record<Species, SpeciesDef> = {
  hand: {
    name: "Hand", codex: "hand", health: 30, walk: 1.2, run: 3.8, size: 0.55,
    // A failed print that kept only its hands: it flees noise and turns from a lamp.
    temperament: { kind: "passive", fleeRange: 6, light: "averse", litAt: 0.5 },
    senses: { sight: 8, cone: 240, hearing: 14, scent: 0, memory: 3 },
    strike: null,
  },
  courier: {
    name: "Courier", codex: "courier", health: 70, walk: 1.6, run: 4.3, size: 1,
    // A runner print: it follows a noise or blood to where it came from and charges what it sees.
    temperament: { kind: "predator", attackRange: 1.7, commitConfidence: 0.45, breakAt: 0.2 },
    senses: { sight: 9, cone: 150, hearing: 18, scent: 16, memory: 6 },
    strike: { damage: 16, windup: 0.45, reach: 1.9, cooldown: 1.3 },
  },
  overrun: {
    name: "The Overrun", codex: "overrun", health: 900, walk: 1.4, run: 3.4, size: 3.2,
    // The leviathan of the Choir: half-blind, drawn to any lamp, and it never breaks off.
    temperament: { kind: "predator", attackRange: 3.2, light: "attracted", litAt: 0.5, breakAt: 0, commitConfidence: 0.7 },
    senses: { sight: 7, cone: 120, hearing: 11, scent: 7, memory: 8 },
    strike: { damage: 60, windup: 1.1, reach: 3.6, cooldown: 2.6 },
  },
};

export function isSpecies(value: string): value is Species { return Object.hasOwn(SPECIES, value); }

/** One creature as the dive saves it. */
export interface Creature {
  id: string;
  species: Species;
  place: Stratum;
  at: Point;
  home: Point;
  health: number;
  mode: TemperamentMode | "winding";
  /** Seconds left on a raised strike, and before the next one. */
  windup: number;
  cooldown: number;
  facing: number;
  /** What it last decided about and why, for the radio and the scanner. */
  target: string | null;
  reason: string;
}

/** Every authored creature at its den, fresh for a new Life. */
export function spawnFauna(): Record<string, Creature> {
  const out: Record<string, Creature> = {};
  for (const spawn of FAUNA) {
    if (!isSpecies(spawn.species)) throw new Error(`Deepward creature has an unknown species: ${spawn.id}`);
    out[spawn.id] = { id: spawn.id, species: spawn.species, place: spawn.place, at: spawn.at, home: spawn.at, health: SPECIES[spawn.species].health,
      mode: "idle", windup: 0, cooldown: 0, facing: 0, target: null, reason: "senses nothing" };
  }
  return out;
}

/** One perception service per species: the ranges differ, the station's wall test does not. */
export function createSpeciesSenses(species: Species, place: () => Stratum): PerceptionService {
  const senses = SPECIES[species].senses;
  return createPerception({
    sightRange: senses.sight, sightConeDeg: senses.cone, hearingRange: senses.hearing, scentRange: senses.scent,
    memorySeconds: senses.memory,
    isSegmentClear: (from, to) => lineOfSight([from[0], from[1], from[2]], [to[0], to[1], to[2]], place()),
    devtoolsName: `deepward.senses.${species}`,
  });
}

/** How far the lamp carries the diver's silhouette, as a multiple of a creature's sight. */
export function diverVisibility(lamp: boolean, ambient: number): number {
  return lamp ? 1.6 : Math.max(0.3, ambient * 1.1);
}

/** What a creature's temperament makes of what it remembers right now. */
export function creatureIntent(creature: Creature, memories: Parameters<typeof decideTemperament>[1]["memories"], lightOf: (targetId: string) => number) {
  const def = SPECIES[creature.species];
  return decideTemperament(def.temperament, { position: creature.at, home: creature.home, health: creature.health / def.health, memories, lightOf });
}
