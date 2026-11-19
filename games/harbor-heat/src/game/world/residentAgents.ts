import { createAgentSystem, type AgentSystem, type AgentSystemState, type AgentTarget } from "@jgengine/core/agents/system";
import type { MoodTier } from "@jgengine/core/agents/mood";
import type { UtilityOption } from "@jgengine/core/ai/utilityBrain";
import type { NeedDefinition } from "@jgengine/core/sim/needs";
import { length2 } from "@jgengine/core/math/scalar";
import { defineStore } from "@jgengine/core/store/defineStore";
import type { Vec3 } from "@jgengine/core/world/geometry";

import { CYCLE_SECONDS, RESIDENTS, residentStops, walkTime, type ResidentSpec } from "./residents";

export const RESIDENT_NEEDS: readonly NeedDefinition[] = [
  { id: "hunger", max: 100, rate: 0.09, start: 78 },
  { id: "rest", max: 100, rate: 0.07, start: 84 },
];

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

export const RESIDENT_MOOD_TIERS: readonly MoodTier[] = [
  { at: 84, id: "bright", label: "Bright" },
  { at: 66, id: "steady", label: "Steady" },
  { at: 46, id: "tired", label: "Tired" },
  { at: 24, id: "weary", label: "Weary" },
  { at: 0, id: "worn", label: "Worn" },
];

const MOOD_WEIGHTS = [
  { need: "hunger", weight: 2 },
  { need: "rest", weight: 1.5 },
];

const NO_OFFERS: AgentTarget[] = [];

/** A point of score is about a minute and a bit of walking, so distance alone never wins. */
const WALK_COST = 0.01;

export const WANDER_PLACE = "place_avenue_cafe";

export const residentAgentStore = defineStore<AgentSystemState | undefined>("harbor.residentAgents", undefined);

// Built on first use: `residents` imports this module, so RESIDENTS is not there yet when it loads.
let specById: Map<string, ResidentSpec> | null = null;

function specOf(id: string): ResidentSpec | undefined {
  specById ??= new Map(RESIDENTS.map((spec) => [spec.id, spec]));
  return specById.get(id);
}

function walkCost(at: Vec3 | null, to: string, places: (id: string) => Vec3 | null): number {
  if (at === null) return WALK_COST;
  const place = places(to);
  if (place === null) return 0;
  return (length2(at[0] - place[0], at[2] - place[2]) / 1.35) * WALK_COST;
}

interface Offer {
  option: string;
  target: string;
  cost: number;
}

export function residentOffers(
  spec: ResidentSpec,
  at: Vec3 | null,
  places: (id: string) => Vec3 | null,
  into: Offer[] = [],
): AgentTarget[] {
  writeOffer(into, 0, "meal", spec.meal, at, places);
  writeOffer(into, 1, "home", spec.home, at, places);
  writeOffer(into, 2, "work", spec.work, at, places);
  writeOffer(into, 3, "wander", WANDER_PLACE, at, places);
  return into;
}

function writeOffer(into: Offer[], index: number, option: string, target: string, at: Vec3 | null, places: (id: string) => Vec3 | null): void {
  const offer = into[index] ?? (into[index] = { option, target, cost: 0 });
  offer.option = option;
  offer.target = target;
  offer.cost = walkCost(at, target, places);
}

export interface ResidentAgentSystem {
  readonly system: AgentSystem;
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
  const offers: Offer[] = [];
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
      // One list refilled per resident: the system reads it before it asks for the next one.
      return spec === undefined ? NO_OFFERS : residentOffers(spec, view.at, options.places, offers);
    },
  });
  return {
    system,
    spec: specOf,
  };
}

