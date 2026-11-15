import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { FURNITURE, FURNITURE_BY_ID, type FurnitureRole } from "../objects/catalog";
import type { HouseholdState } from "../session/types";
import { nextBill, RATION_BUNDLE } from "./economy";
import { boardingOf, roomOf, tenantComfort, vacantRooms } from "../boarding/boarding";
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
/** What the next-step note is pointing at, and the room it names, so a pad or a proof can follow it. */
export type GuideKind = "applicant" | "miserable" | "leak" | "spareRoom" | "workStation" | "bill" | "pantry" | "steady";
export const GUIDE_KINDS: readonly GuideKind[] = ["applicant", "miserable", "leak", "spareRoom", "workStation", "bill", "pantry", "steady"];

export function dayGuide(state: HouseholdState, objects: readonly SceneObject[]): { kind: GuideKind; text: string; slot: number; tenant: string | null } {
  const hasWorkStation = objects.some(object => FURNITURE_BY_ID[object.catalogId]?.role === "work");
  const boarding = boardingOf(state);
  const at = (kind: GuideKind, text: string, slot = -1, tenant: string | null = null) => ({ kind, text, slot, tenant });
  if (boarding.applicant !== null) return at("applicant", `Next: ${SPECIES[boarding.applicant.species].name} at the airlock — interview them before they drift off.`, vacantRooms(state)[0]?.slot ?? -1);
  const miserable = state.order.find((id) => roomOf(state, id) !== null && tenantComfort(state, id).score < 30);
  if (miserable !== undefined) return at("miserable", `Next: ${state.members[miserable]!.name} is miserable — fix their room in the Rooms plan.`, roomOf(state, miserable)!.slot, miserable);
  const leaky = state.order.find((id) => roomOf(state, id) !== null && tenantComfort(state, id).reasons.some((r) => r.factor === "leak"));
  if (leaky !== undefined) return at("leak", `Next: ${state.members[leaky]!.name} can smell next door's air — swap rooms or seal the wall (Rooms).`, roomOf(state, leaky)!.slot, leaky);
  const fixture = state.order.find((id) => roomOf(state, id) === null);
  const spare = vacantRooms(state)[0];
  if (fixture !== undefined && spare !== undefined) return at("spareRoom", `Next: a room stands empty — give ${state.members[fixture]!.name} a door, or wait for an applicant.`, spare.slot, fixture);
  const bill = Math.round(nextBill(state, objects));
  if (!hasWorkStation) return at("workStation", "Next: furnish a Gig Terminal so a tenant can earn toward the bills.");
  if (state.credits < bill) return at("bill", `Next: find ${Math.round(bill - state.credits)} more credits before the ${bill}-credit docking bill.`);
  if (state.pantry < LOW_RATIONS) return at("pantry", `Next: buy ${RATION_BUNDLE.quantity} rations in Pantry & bills before the galley runs short.`);
  return at("steady", `Next: keep the tenants comfy and cover the ${bill}-credit docking bill.`);
}

/**
 * The single next thing the house needs, in plain words. Ordered by what stops it first: someone
 * at the airlock, a miserable or leaking room, an empty room, no earning station, the bill, food.
 */
export function dayGoal(state: HouseholdState, objects: readonly SceneObject[]): string {
  return dayGuide(state, objects).text;
}
