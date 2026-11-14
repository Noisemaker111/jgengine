import { buildableDef } from "../objects/catalog";
import { visitorKind } from "../entities/guests/catalog";
import type { CoasterCircuit } from "../coaster/circuit";

/** A visitor kind's name and the Thrill it enjoys most, from its card. */
export function guestRidePreference(kind: string): { label: string; thrill: number } {
  const card = visitorKind(kind);
  return { label: card.label, thrill: card.thrill };
}

/** The visitor kinds a ride's fit is shown for: the timid, the middling and the bold. */
export const FIT_KINDS: readonly string[] = ["visitor_family", "visitor_couple", "visitor_teen"];

/** The shake a rider feels: a coaster's is what its circuit actually does, a flat ride's is its own Thrill. */
export function rideThrill(catalogId: string, circuit: CoasterCircuit): number {
  const def = buildableDef(catalogId);
  if (catalogId === "ride_coaster") return circuit.intensity;
  return def.ride?.intensity ?? 0;
}

export function rideFit(kind: string, catalogId: string, circuit: CoasterCircuit): number {
  return Math.max(0.1, 1 - Math.abs(rideThrill(catalogId, circuit) - guestRidePreference(kind).thrill) / 10);
}

export function rideHappiness(kind: string, catalogId: string, circuit: CoasterCircuit): number {
  // A ride far too wild or far too tame for a visitor's nerve can sour them; a fitting one is the night out they came for.
  return 12 * rideFit(kind, catalogId, circuit) - 4;
}
