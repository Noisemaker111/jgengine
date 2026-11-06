import { eatWhileRoom } from "@jgengine/core/stats/doseTable";
import { createVitals, type Vitals, type VitalsState } from "@jgengine/core/stats/vitals";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { perContext } from "@jgengine/core/runtime/perContext";

import { creatureSupply, foodMaxOf, starveCreature, tames } from "./creatures";
import { speciesDef } from "./data/species";
import { STARVE_HEALTH_SHARE, TAME_DIET, TAME_FOOD_DRAIN_SECONDS } from "./data/tameFood";

/**
 * Every tame's food, a body of one vital: it drains, the tame eats what its diet takes from its own
 * inventory whenever a meal fits ({@link eatWhileRoom} over {@link TAME_DIET}), and an empty meter starves
 * it to death. A growing baby's faster hunger is a pace on the same drain, set by breeding.
 */
interface Hunger {
  bodies: Map<string, Vitals>;
  /** Drain multiplier per tame; 1 when unset. */
  pace: Map<string, number>;
}

const hungerOf = perContext((): Hunger => ({ bodies: new Map(), pace: new Map() }));

const foodBody = (max: number, start: number): Vitals => createVitals([{ id: "food", max, start, rate: -max / TAME_FOOD_DRAIN_SECONDS }]);

/** The tame's body, made full the first time it is asked for, its max kept to the food stat. */
function bodyOf(ctx: GameContext, id: string): Vitals | null {
  const max = foodMaxOf(ctx, id);
  if (!(max > 0)) return null;
  const hunger = hungerOf(ctx);
  let body = hunger.bodies.get(id);
  if (body === undefined) {
    body = foodBody(max, max);
    hunger.bodies.set(id, body);
  } else if (body.max("food") !== max) {
    const value = Math.min(max, body.value("food"));
    body.retune([{ id: "food", max, start: value, rate: -max / TAME_FOOD_DRAIN_SECONDS }]);
    body.setMax("food", max);
  }
  return body;
}

export function tickTameHunger(ctx: GameContext, dt: number): void {
  const hunger = hungerOf(ctx);
  const alive = new Set<string>();
  for (const tame of tames(ctx)) {
    alive.add(tame.id);
    const body = bodyOf(ctx, tame.id);
    const diet = speciesDef(tame.species)?.diet;
    const supply = creatureSupply(ctx, tame.id);
    if (body === null || diet === undefined || supply === null) continue;
    body.tick(dt, { drain: { food: hunger.pace.get(tame.id) ?? 1 } });
    eatWhileRoom(body, TAME_DIET, diet, supply, "food");
    if (body.value("food") <= 0) starveCreature(ctx, tame.id, STARVE_HEALTH_SHARE * dt);
  }
  for (const id of [...hunger.bodies.keys()]) {
    if (alive.has(id)) continue;
    hunger.bodies.delete(id);
    hunger.pace.delete(id);
  }
}

/** A tame's food and max, or null when it is not a tame. */
export function tameFood(ctx: GameContext, id: string): { value: number; max: number } | null {
  const body = hungerOf(ctx).bodies.get(id) ?? (tames(ctx).some((tame) => tame.id === id) ? bodyOf(ctx, id) : null);
  return body === null || body === undefined ? null : { value: body.value("food"), max: body.max("food") };
}

/** Set a tame's food to a share of its max (a newborn starts with a tenth). */
export function setTameFood(ctx: GameContext, id: string, share: number): void {
  const body = bodyOf(ctx, id);
  if (body !== null) body.change("food", body.max("food") * Math.max(0, Math.min(1, share)) - body.value("food"));
}

/** How fast a tame's food drains, as a multiple of a grown tame's (a growing baby eats faster). */
export function setFoodPace(ctx: GameContext, id: string, pace: number): void {
  const hunger = hungerOf(ctx);
  if (pace === 1) hunger.pace.delete(id);
  else hunger.pace.set(id, Math.max(0, pace));
}

interface HungerSave {
  bodies: Record<string, VitalsState>;
  pace: Record<string, number>;
}

export function tameHungerSave(ctx: GameContext) {
  return {
    key: "fernwild.tameHunger",
    snapshot: (): HungerSave => {
      const hunger = hungerOf(ctx);
      return { bodies: Object.fromEntries([...hunger.bodies].map(([id, body]) => [id, body.state()])), pace: Object.fromEntries(hunger.pace) };
    },
    hydrate: (data: HungerSave) => {
      const hunger = hungerOf(ctx);
      hunger.bodies.clear();
      for (const [id, state] of Object.entries(data.bodies)) {
        const body = foodBody(state.maxes["food"] ?? 1, 0);
        body.restore(state);
        hunger.bodies.set(id, body);
      }
      hunger.pace = new Map(Object.entries(data.pace));
    },
  };
}

export function resetTameHunger(ctx: GameContext): void {
  const hunger = hungerOf(ctx);
  hunger.bodies.clear();
  hunger.pace.clear();
}
