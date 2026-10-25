import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { FURNITURE, FURNITURE_BY_ID, type FurnitureRole } from "../objects/catalog";
import type { HouseholdState } from "../session/types";
import { nextBill, RATION_BUNDLE } from "./economy";

/** Rations at or below this count make the pantry the household's most urgent need. */
const LOW_RATIONS = 4;

/**
 * Why a being has no station for a goal, pointing at the fix in the same words as `dayGoal`.
 * `furnished` is true when a matching station exists but is occupied.
 */
export function stationShortfall(role: FurnitureRole, planter: boolean, furnished: boolean): string {
  const name = planter ? "Bloom Planter" : FURNITURE.find(def => def.role === role && def.id !== "bloom_planter")?.name ?? role;
  const word = planter ? `${name} station` : `${role} station`;
  return furnished
    ? `No free ${word} — furnish another ${name} (Furnish menu)`
    : `No ${word} — furnish a ${name} (Furnish menu)`;
}

/**
 * The single next thing the household needs, in plain words. Ordered by what stops the
 * habitat first: no earning station, then the midnight bill, then food.
 */
export function dayGoal(state: HouseholdState, objects: readonly SceneObject[]): string {
  const hasWorkStation = objects.some(object => FURNITURE_BY_ID[object.catalogId]?.role === "work");
  const bill = Math.round(nextBill(state, objects));
  if (!hasWorkStation) return "Next: furnish a Yield Console so a being can earn credits before midnight.";
  if (state.credits < bill) return `Next: earn ${Math.round(bill - state.credits)} more credits before the ${bill}-credit midnight bill.`;
  if (state.pantry < LOW_RATIONS) return `Next: buy ${RATION_BUNDLE.quantity} rations in Pantry & bills before the household runs short.`;
  return `Next: keep everyone fed and cover the ${bill}-credit midnight bill.`;
}
