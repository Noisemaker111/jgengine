import { buildableDef } from "../objects/catalog";
import type { CoasterCircuit } from "../coaster/circuit";

/** Derived from existing saved guest kinds: no new save fields or random draws. */
export function guestRidePreference(kind: string): { label: string; thrill: number } {
  if (kind === "guest_a" || kind === "guest_b") return { label: "Family", thrill: 3.5 };
  if (kind === "guest_d" || kind === "guest_e") return { label: "Thrill seeker", thrill: 8 };
  return { label: "Explorer", thrill: 5.5 };
}

/** The force a guest feels: a coaster's is what its circuit actually does, a flat ride's is its own. */
export function rideThrill(catalogId: string, circuit: CoasterCircuit): number {
  const def = buildableDef(catalogId);
  if (catalogId === "ride_coaster") return circuit.intensity;
  return def.ride?.intensity ?? 0;
}

export function rideFit(kind: string, catalogId: string, circuit: CoasterCircuit): number {
  return Math.max(0.1, 1 - Math.abs(rideThrill(catalogId, circuit) - guestRidePreference(kind).thrill) / 10);
}

export function rideHappiness(kind: string, catalogId: string, circuit: CoasterCircuit): number {
  // A frightening or boring ride can lose happiness; a fitting ride earns return visits.
  return 12 * rideFit(kind, catalogId, circuit) - 4;
}
