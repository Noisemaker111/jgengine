import type { KartTuning } from "../parts/build";
import { CORRIDOR_LANE_SPAN } from "../run/constants";
import type { ZoneId } from "../zones/catalog";

export type GateRequirement = "plow" | "jump";

export interface RouteGate {
  id: string;
  zoneId: ZoneId;
  requirement: GateRequirement;
  /** The band of X this barricade spans. Corridor-spanning barricades block the whole drivable width. */
  laneX: readonly [number, number];
  atZ: number;
  label: string;
  radioLine: string;
}

/**
 * The escape corridor is a gauntlet of full-width salvage barricades. Each one seals the entire
 * drivable width and only opens for a kart carrying the matching part — a welded plow blade smashes
 * through the debris walls, coil-spring hops clear the ramps. A bare chassis is walled in at the first
 * barricade, so the plow/jump upgrade fantasy is load-bearing: no part, no progress. The pickup layout
 * (see run/pickups.ts) drops the plow blade and coil springs on the centerline BEFORE the first
 * barricade of each type, and never re-offers those slots afterward, so a kart that grabs the route
 * parts keeps them all the way to the exit.
 */
export const ROUTE_GATES: readonly RouteGate[] = [
  {
    id: "gate_canyon_plow",
    zoneId: "canyons",
    requirement: "plow",
    laneX: CORRIDOR_LANE_SPAN,
    atZ: 110,
    label: "CRUSHED-CAR WALL",
    radioLine: "PLOWED THE CAR WALL — SHE'S UGLY BUT SHE'S FAST",
  },
  {
    id: "gate_canyon_jump",
    zoneId: "canyons",
    requirement: "jump",
    laneX: CORRIDOR_LANE_SPAN,
    atZ: 150,
    label: "TIRE-STACK RAMP",
    radioLine: "CLEARED THE TIRE STACK — NICE AIR",
  },
  {
    id: "gate_flats_plow_1",
    zoneId: "flats",
    requirement: "plow",
    laneX: CORRIDOR_LANE_SPAN,
    atZ: 210,
    label: "FRIDGE BLOCKADE",
    radioLine: "FRIDGE BLOCKADE DOWN — KEEP ROLLING",
  },
  {
    id: "gate_flats_jump",
    zoneId: "flats",
    requirement: "jump",
    laneX: CORRIDOR_LANE_SPAN,
    atZ: 250,
    label: "WASHER-PILE RAMP",
    radioLine: "OVER THE WASHER PILE — LOOKED GOOD FROM HERE",
  },
  {
    id: "gate_flats_plow_2",
    zoneId: "flats",
    requirement: "plow",
    laneX: CORRIDOR_LANE_SPAN,
    atZ: 300,
    label: "STOVE-STACK LINE",
    radioLine: "STOVE STACK SCATTERED — DON'T LOOK BACK",
  },
  {
    id: "gate_gantry_jump_1",
    zoneId: "gantry",
    requirement: "jump",
    laneX: CORRIDOR_LANE_SPAN,
    atZ: 350,
    label: "CONTAINER GAP",
    radioLine: "CONTAINER GAP CLEARED — BIG AIR",
  },
  {
    id: "gate_gantry_plow",
    zoneId: "gantry",
    requirement: "plow",
    laneX: CORRIDOR_LANE_SPAN,
    atZ: 400,
    label: "CRANE DEBRIS FIELD",
    radioLine: "PLOWED THE CRANE DEBRIS — ALMOST HOME",
  },
  {
    id: "gate_gantry_jump_2",
    zoneId: "gantry",
    requirement: "jump",
    laneX: CORRIDOR_LANE_SPAN,
    atZ: 440,
    label: "FINAL GANTRY LEAP",
    radioLine: "FINAL GANTRY LEAP — SEE YOU AT THE GATE",
  },
];

export function gateSatisfied(gate: RouteGate, tuning: KartTuning): boolean {
  return gate.requirement === "plow" ? tuning.hasPlow : tuning.jumpPower > 0;
}

export function inLane(x: number, laneX: readonly [number, number]): boolean {
  return x >= laneX[0] && x <= laneX[1];
}

export function blockedZ(x: number, currentZ: number, candidateZ: number, tuning: KartTuning): number {
  let maxZ = candidateZ;
  for (const gate of ROUTE_GATES) {
    if (!inLane(x, gate.laneX)) continue;
    if (currentZ > gate.atZ) continue;
    if (gateSatisfied(gate, tuning)) continue;
    if (candidateZ > gate.atZ) maxZ = Math.min(maxZ, gate.atZ);
  }
  return maxZ;
}

export function gatesInZone(zoneId: ZoneId): readonly RouteGate[] {
  return ROUTE_GATES.filter((gate) => gate.zoneId === zoneId);
}

/** Lowest-Z barricade the given tuning cannot open, or null if the build clears the whole route. */
export function firstUnsatisfiedGate(tuning: KartTuning): RouteGate | null {
  let earliest: RouteGate | null = null;
  for (const gate of ROUTE_GATES) {
    if (gateSatisfied(gate, tuning)) continue;
    if (earliest === null || gate.atZ < earliest.atZ) earliest = gate;
  }
  return earliest;
}
