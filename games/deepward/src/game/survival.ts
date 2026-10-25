import { createDecayMeterSet, type DecayMeterConfig, type DecayMeterSet, type DecayMeterSetState } from "@jgengine/core/survival/decayMeter";

/**
 * The diver's body: food and water drain over play time (faster in the cold, thirstier in the ink),
 * an empty meter bleeds the suit, and Marrow's galley tops the body up whenever you stand at home.
 * Early on the galley is three tins and three flasks; once a still and a growbed run, it refills
 * itself while you dive and the meters stop being the thing that ends a Life.
 */
export const BODY: readonly DecayMeterConfig[] = [
  { id: "food", max: 100, rate: 100 / 600, thresholds: [{ id: "hungry", label: "Hungry", at: 30, when: "below", severity: "warning" }, { id: "starving", label: "Starving", at: 1, when: "below", severity: "critical" }] },
  { id: "water", max: 100, rate: 100 / 420, thresholds: [{ id: "thirsty", label: "Thirsty", at: 30, when: "below", severity: "warning" }, { id: "parched", label: "Parched", at: 1, when: "below", severity: "critical" }] },
];
/** What one ration or one flask puts back. */
export const MEAL = { food: 45, water: 50 } as const;
/** Marrow's galley feeds you below this, so walking in hungry is enough. */
export const GALLEY_FEEDS_BELOW = 70;
/** Suit damage a second for each empty meter during a dive. */
export const STARVE_DAMAGE = 1.5;
/** Time at home drains the body at this fraction of the dive rate. */
export const HOME_DRAIN = 0.35;

export function createBody(saved?: DecayMeterSetState): DecayMeterSet {
  const body = createDecayMeterSet(BODY);
  if (saved !== undefined) body.restore(saved);
  return body;
}

/** A fresh Life wakes fed: the printer fills both meters. */
export function freshBody(): DecayMeterSetState { return createBody().serialize(); }

export function validBody(value: unknown): value is DecayMeterSetState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as DecayMeterSetState;
  const meter = (id: string) => typeof state.values?.[id] === "number" && Number.isFinite(state.values[id]) && state.values[id]! >= 0 && state.values[id]! <= 100;
  return meter("food") && meter("water") && typeof state.rates === "object" && state.rates !== null && typeof state.modifiers === "object" && state.modifiers !== null;
}

/** Which belt supply the body wants most, or null when it wants neither. */
export function hungriest(body: Readonly<Record<string, number>>, belt: { ration: number; water: number }): "ration" | "water" | null {
  const food = body.food ?? 0, water = body.water ?? 0;
  const wantsFood = belt.ration > 0 && food <= 100 - MEAL.food * 0.5;
  const wantsWater = belt.water > 0 && water <= 100 - MEAL.water * 0.5;
  if (wantsFood && wantsWater) return food <= water ? "ration" : "water";
  return wantsFood ? "ration" : wantsWater ? "water" : null;
}
