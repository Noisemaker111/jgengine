import { createAgentSystem, type AgentSystem, type AgentSystemState, type AgentTarget } from "@jgengine/core/agents/system";
import type { MoodTier } from "@jgengine/core/agents/mood";
import type { UtilityOption } from "@jgengine/core/ai/utilityBrain";
import type { NeedDefinition } from "@jgengine/core/sim/needs";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { Vec3 } from "@jgengine/core/world/geometry";

import { CYCLE_SECONDS, RESIDENTS, residentStops, walkTime, type ResidentSpec } from "./residents";

/**
 * Mainsail's residents as one agent system: what they need, what a day in the city offers them, and
 * the town's own words for how a resident feels. The loop is `@jgengine/core/agents/system`; the
 * content, the selector and the words are this game's.
 */

/** What a resident carries through their day: hunger and rest, drained over the twelve-minute day. */
export const RESIDENT_NEEDS: readonly NeedDefinition[] = [
  { id: "hunger", max: 100, rate: 0.09, start: 78 },
  { id: "rest", max: 100, rate: 0.07, start: 84 },
];

/** What a resident can do here: eat, go home, work, or take the boulevard. */
export const RESIDENT_OPTIONS: readonly UtilityOption[] = [
  { id: "meal", terms: [{ need: "hunger", curve: { kind: "linear", from: 0.2, to: 0.95 } }] },
  { id: "home", base: 0.05, terms: [{ need: "rest", curve: { kind: "linear", from: 0.2, to: 0.95 } }] },
  {
    id: "work",
    base: 0.35,
    // A shift wants a full belly and a full night, so both terms fall away as the meters empty.
    terms: [
      { need: "hunger", curve: { kind: "linear", from: 1, to: 0.3 }, weight: 0.25 },
      { need: "rest", curve: { kind: "linear", from: 1, to: 0.3 }, weight: 0.2 },
    ],
  },
  { id: "wander", base: 0.15 },
];

/** The town's tone on the shared 0-100 mood scale. */
export const RESIDENT_MOOD_TIERS: readonly MoodTier[] = [
  { at: 84, id: "bright", label: "Bright" },
  { at: 66, id: "steady", label: "Steady" },
  { at: 46, id: "tired", label: "Tired" },
  { at: 24, id: "weary", label: "Weary" },
  { at: 0, id: "worn", label: "Worn" },
];

/** A resident's mood weights: an empty belly sours a day faster than a short night. */
const MOOD_WEIGHTS = [
  { need: "hunger", weight: 2 },
  { need: "rest", weight: 1.5 },
];

/** A point of score is about a minute and a bit of walking, so distance alone never wins. */
const WALK_COST = 0.01;

/** The one place everybody drifts to when nothing else pulls: the avenue's cafe corner. */
export const WANDER_PLACE = "place_avenue_cafe";

/** Saved resident agents, riding the whole-world save with the rest of the stores. */
export const residentAgentStore = defineStore<AgentSystemState | undefined>("harbor.residentAgents", undefined);

/** Authored resident by id. Looked up per call, so this module keeps no state during the residents cycle. */
function specOf(id: string): ResidentSpec | undefined {
  return RESIDENTS.find((spec) => spec.id === id);
}

function walkCost(at: Vec3 | null, to: string, places: (id: string) => Vec3 | null): number {
  if (at === null) return WALK_COST;
  const place = places(to);
  if (place === null) return 0;
  return (Math.hypot(at[0] - place[0], at[2] - place[2]) / 1.35) * WALK_COST;
}

/**
 * Everything this town can offer one resident right now: a meal at the place its evening takes it, a
 * bed at home, its shift, and the avenue. Written once for the whole cast - not a callback per option.
 */
export function residentOffers(
  spec: ResidentSpec,
  at: Vec3 | null,
  places: (id: string) => Vec3 | null,
): AgentTarget[] {
  return [
    { option: "meal", target: spec.meal, cost: walkCost(at, spec.meal, places) },
    { option: "home", target: spec.home, cost: walkCost(at, spec.home, places) },
    { option: "work", target: spec.work, cost: walkCost(at, spec.work, places) },
    { option: "wander", target: WANDER_PLACE, cost: walkCost(at, WANDER_PLACE, places) },
  ];
}

export interface ResidentAgentSystem {
  readonly system: AgentSystem;
  /** Authored spec for a resident id. */
  spec(id: string): ResidentSpec | undefined;
}

/**
 * Build the cast: every authored resident joins with the same routine the city walks, so a resident's
 * day and its decisions agree. The selector is handed the resident's position from the off-screen
 * world, and each member inherits the system's fallback instead of declaring one per target.
 *
 * @capability agents a needs, thought, action and mood loop an agent runs on the world clock
 */
export function createResidentAgents(options: {
  readonly clock: { now(): number };
  readonly rng: () => number;
  readonly position: (id: string) => Vec3 | null;
  readonly places: (id: string) => Vec3 | null;
  readonly storage: { read(): AgentSystemState | undefined; write(next: AgentSystemState): void };
}): ResidentAgentSystem {
  const system = createAgentSystem({
    needs: RESIDENT_NEEDS,
    options: RESIDENT_OPTIONS,
    mood: { tiers: RESIDENT_MOOD_TIERS, weights: MOOD_WEIGHTS },
    clock: options.clock,
    rng: options.rng,
    position: options.position,
    storage: options.storage,
    fallback: { option: "wander", target: WANDER_PLACE },
    defaults: { switchMargin: 0.08, minHoldSeconds: 2, jitter: 0.05 },
    devtoolsName: "harbor.residentAgents",
    members: RESIDENTS.map((spec, index) => ({
      id: spec.id,
      schedule: { cycleSeconds: CYCLE_SECONDS, travelSeconds: walkTime, stops: residentStops(spec, index) },
    })),
    select: (view) => {
      const spec = specOf(view.id);
      return spec === undefined ? [] : residentOffers(spec, view.at, options.places);
    },
  });
  return {
    system,
    spec: specOf,
  };
}

