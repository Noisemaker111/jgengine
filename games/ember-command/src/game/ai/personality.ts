import type { EncounterDefinition } from "@jgengine/core/waves/encounter";
import type { EncounterSequenceConfig as PlanConfig } from "@jgengine/core/waves/encounterSequence";

import { defineStore } from "@jgengine/core/store/defineStore";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { ENEMY_WAVE_INTERVAL, ENEMY_WAVE_MAX_FIELDED } from "../tuning";
import { MARCH_ENTRY, RIVAL_WAVES } from "./waveManifest";

/**
 * Who runs the black colony in a free skirmish. Each personality is pure data the wave director reads:
 * how often it marches, how many it keeps on the field, what its raids are made of, and how hard its
 * wasp allies sortie. The campaign always meets the classic colony; a skirmish picks one (or rolls).
 */
export type PersonalityId = "classic" | "swarm" | "diggers" | "wasp-friends";

export interface Personality {
  id: PersonalityId;
  label: string;
  blurb: string;
  /** Seconds between raids once the attack starts. */
  interval: number;
  /** Raids hold while this many black units are already fielded. */
  maxFielded: number;
  waves: EncounterDefinition;
  /** What a raid marches on: the red nest, the nearest chamber, or wherever the foragers are. */
  target: "nest" | "chambers" | "foragers";
  /** Multiplier on the wasp nest's sortie interval (below 1 sorties come sooner). */
  waspTempo: number;
}

const g = (unit: string, count: number, extra: { escalates?: boolean; at?: number } = {}) => ({ unit, entry: MARCH_ENTRY, count, ...extra });

export const PERSONALITIES: Readonly<Record<PersonalityId, Personality>> = {
  classic: {
    id: "classic",
    label: "The Black Colony",
    blurb: "Raiders first, majors from the third raid, wasps late. Steady pressure.",
    interval: ENEMY_WAVE_INTERVAL,
    maxFielded: ENEMY_WAVE_MAX_FIELDED,
    waves: RIVAL_WAVES,
    target: "nest",
    waspTempo: 1,
  },
  swarm: {
    id: "swarm",
    label: "The Swarm",
    blurb: "Raiders and nothing but raiders, every half-minute and ever more of them. Hold a line of soldiers.",
    interval: 30,
    maxFielded: 26,
    waves: {
      id: "swarm-march",
      waves: [
        { id: "s1", label: "Swarm", groups: [g("raider", 4)] },
        { id: "s2", label: "Swarm", groups: [g("raider", 5, { escalates: true })] },
        { id: "s3", label: "Swarm", groups: [g("raider", 6, { escalates: true })] },
        { id: "s4", label: "Swarm", groups: [g("raider", 7, { escalates: true })] },
        { id: "s5", label: "Swarm", groups: [g("raider", 8, { escalates: true })] },
      ],
    },
    target: "nest",
    waspTempo: 1.5,
  },
  diggers: {
    id: "diggers",
    label: "The Diggers",
    blurb: "Slow, heavy raids of black majors that go straight for your chambers. Spitters and acid mounds.",
    interval: 55,
    maxFielded: 18,
    waves: {
      id: "diggers-march",
      waves: [
        { id: "d1", label: "Diggers", groups: [g("major", 1), g("raider", 2)] },
        { id: "d2", label: "Diggers", groups: [g("major", 2, { escalates: true }), g("raider", 2)] },
        { id: "d3", label: "Diggers", groups: [g("major", 3, { escalates: true }), g("raider", 2)] },
        { id: "d4", label: "Diggers", groups: [g("major", 4, { escalates: true }), g("raider", 3)] },
      ],
    },
    target: "chambers",
    waspTempo: 1.5,
  },
  "wasp-friends": {
    id: "wasp-friends",
    label: "The Wasp-Friends",
    blurb: "Wasps fly with every raid and sortie often from the nest, hunting your foragers. Keep spitters home.",
    interval: 45,
    maxFielded: 22,
    waves: {
      id: "wasp-march",
      waves: [
        { id: "w1", label: "Wasp raid", groups: [g("raider", 2), g("wasp", 1)] },
        { id: "w2", label: "Wasp raid", groups: [g("raider", 3, { escalates: true }), g("wasp", 2)] },
        { id: "w3", label: "Wasp raid", groups: [g("raider", 3, { escalates: true }), g("wasp", 2), g("major", 1, { at: 3 })] },
        { id: "w4", label: "Wasp raid", groups: [g("raider", 4, { escalates: true }), g("wasp", 3), g("major", 1, { at: 3 })] },
      ],
    },
    target: "foragers",
    waspTempo: 0.6,
  },
};

export const SKIRMISH_PERSONALITIES: readonly PersonalityId[] = ["swarm", "diggers", "wasp-friends"];

export function personalityOf(id: PersonalityId): Personality {
  return PERSONALITIES[id];
}

const plans = new Map<PersonalityId, PlanConfig>();

/** The black colony's plan for a personality: scout, raise a camp, then march every `interval`. One
 * config object per personality, so the plan state always advances against the same definition. */
export function marchPlanFor(personality: Personality): PlanConfig {
  const cached = plans.get(personality.id);
  if (cached !== undefined) return cached;
  const plan: PlanConfig = {
    phases: [
      {
        id: "scout",
        completion: { kind: "quorum", params: { count: 1, predicates: [{ kind: "flag", params: { flag: "contact" } }, { kind: "timer", params: { seconds: 45 } }] } },
      },
      { id: "expand", completion: { kind: "flag", params: { flag: "campRaised" } } },
      { id: "attack", repeat: 5000, completion: { kind: "timer", params: { seconds: personality.interval } } },
    ],
  };
  plans.set(personality.id, plan);
  return plan;
}

/** The skirmish rival the commander picked on the title sheet, or "roll" for a surprise. */
export type RivalChoice = PersonalityId | "roll";
export const rivalStore = defineStore<RivalChoice>("lawn.rival", "roll");

/** Settle who runs the black colony: the campaign meets the classic colony, a skirmish its pick. */
export function resolveRival(ctx: GameContext, skirmish: boolean): PersonalityId {
  if (!skirmish) return "classic";
  const choice = rivalStore.read(ctx);
  if (choice !== "roll" && isPersonalityId(choice)) return choice;
  const roll = Math.min(SKIRMISH_PERSONALITIES.length - 1, Math.floor(ctx.rng() * SKIRMISH_PERSONALITIES.length));
  return SKIRMISH_PERSONALITIES[roll]!;
}

export function isPersonalityId(value: unknown): value is PersonalityId {
  return typeof value === "string" && value in PERSONALITIES;
}
