import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { FURNITURE, FURNITURE_BY_ID, type FurnitureRole } from "../objects/catalog";
import type { HouseholdState } from "../session/types";
import { nextBill, RATION_BUNDLE } from "./economy";
import { boardingOf, roomOf, tenantComfort } from "../boarding/boarding";
import { SPECIES } from "../boarding/species";

/** Rations at or below this count make the pantry the household's most urgent need. */
const LOW_RATIONS = 4;

/**
 * Why a being has no station for a goal, pointing at the fix in the same words as `dayGoal`.
 * `furnished` is true when a matching station exists but is occupied.
 */
export function stationShortfall(role: FurnitureRole, planter: boolean, furnished: boolean): string {
  const name = planter ? "Hydro Tray" : FURNITURE.find(def => def.role === role && def.id !== "bloom_planter")?.name ?? role;
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
  const boarding = boardingOf(state);
  if (boarding.applicant !== null) return `Next: ${SPECIES[boarding.applicant.species].name} is buzzing at the airlock — interview them.`;
  const miserable = state.order.find((id) => roomOf(state, id) !== null && tenantComfort(state, id).score < 30);
  if (miserable !== undefined) return `Next: ${state.members[miserable]!.name} is miserable — fix their room in the Rooms plan.`;
  const bill = Math.round(nextBill(state, objects));
  if (!hasWorkStation) return "Next: furnish a Gig Terminal so a tenant can earn toward the bills.";
  if (state.credits < bill) return `Next: find ${Math.round(bill - state.credits)} more credits before the ${bill}-credit docking bill.`;
  if (state.pantry < LOW_RATIONS) return `Next: buy ${RATION_BUNDLE.quantity} rations in Pantry & bills before the galley runs short.`;
  return `Next: keep the tenants comfy and cover the ${bill}-credit docking bill.`;
}
